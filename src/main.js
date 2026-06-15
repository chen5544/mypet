import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PET_WINDOW } from "./angle-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Portable mode: store user data next to the exe on Windows
if (process.platform === "win32" && app.isPackaged) {
  const userDataPath = path.join(root, "userdata");
  try { mkdirSync(userDataPath, { recursive: true }); } catch (_) {}
  app.setPath("userData", userDataPath);
}

let petWindow;
let tray;
let locked = false;
let cursorTimer;
const WALK_SPEED = 115;
const RUN_SPEED = 200;
const EDGE_ZONE = 60; // pixels from screen edge to trigger fade transition

let walkTimer;
let walkDirection = 1;
let walkLastTick = 0;
let walkPhase = null; // null | "exiting" | "entering"
let currentSpeed = WALK_SPEED;

function makeTrayIcon() {
  // Use a 32x32 PNG for cross-platform reliability (SVG tray has issues on Windows)
  const size = 32;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Simple cat face: dark circle with yellow eyes
      if (dist < 14) {
        // Head
        canvas[i] = 31; canvas[i + 1] = 35; canvas[i + 2] = 40; canvas[i + 3] = 255;
      } else {
        canvas[i + 3] = 0;
      }
      // Eyes
      if ((Math.abs(x - 11) < 3 && Math.abs(y - 12) < 3) ||
          (Math.abs(x - 21) < 3 && Math.abs(y - 12) < 3)) {
        canvas[i] = 242; canvas[i + 1] = 210; canvas[i + 2] = 103; canvas[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function getInitialBounds() {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = PET_WINDOW.width;
  const height = PET_WINDOW.height;
  return {
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - PET_WINDOW.marginRight),
    y: Math.round(workArea.y + workArea.height - height - PET_WINDOW.marginBottom)
  };
}

function sendCursorUpdate() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  petWindow.webContents.send("cursor:update", {
    cursor,
    windowBounds: bounds,
    locked
  });
}

function sendWalkUpdate() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send("walk:update", {
    walking: Boolean(walkTimer),
    direction: walkDirection > 0 ? "right" : "left",
    phase: walkPhase
  });
}

function sendWalkEdgeUpdate(phase) {
  walkPhase = phase;
  sendWalkUpdate();
}

function stopWalking() {
  if (walkTimer) {
    clearInterval(walkTimer);
    walkTimer = undefined;
  }
  walkLastTick = 0;
  walkPhase = null;
  sendWalkUpdate();
}

function tickWalking() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const now = Date.now();
  const dt = walkLastTick ? Math.min(0.05, (now - walkLastTick) / 1000) : 0;
  walkLastTick = now;
  if (dt === 0) return;

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const { workArea } = display;
  const winW = PET_WINDOW.width;
  const winH = PET_WINDOW.height;
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - winW;
  let nextX = bounds.x + walkDirection * currentSpeed * dt;

  // Clamp before edge detection to avoid overshoot oscillation
  if (nextX > maxX) nextX = maxX;
  if (nextX < minX) nextX = minX;

  // Edge zone detection for fade transition
  const distToEdge = walkDirection > 0 ? maxX - nextX : nextX - minX;

  if (distToEdge <= EDGE_ZONE && walkPhase !== "exiting" && walkPhase !== "entering") {
    sendWalkEdgeUpdate("exiting");
  }

  let reversed = false;
  if (nextX >= maxX && walkDirection > 0) {
    walkDirection = -1;
    reversed = true;
  } else if (nextX <= minX && walkDirection < 0) {
    walkDirection = 1;
    reversed = true;
  }

  if (reversed) {
    sendWalkEdgeUpdate("entering");
  }

  // Clear entering phase once cat has moved away from edge
  if (walkPhase === "entering") {
    const distFromEdge = walkDirection > 0 ? nextX - minX : maxX - nextX;
    if (distFromEdge > EDGE_ZONE) {
      sendWalkEdgeUpdate(null);
    }
  }

  petWindow.setBounds({ x: Math.round(nextX), y: bounds.y, width: winW, height: winH });
  sendCursorUpdate();
}

function startWalking() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const centerX = bounds.x + bounds.width / 2;
  const displayCenterX = display.workArea.x + display.workArea.width / 2;
  walkDirection = centerX <= displayCenterX ? 1 : -1;
  walkLastTick = Date.now();
  walkPhase = null;
  if (!walkTimer) {
    walkTimer = setInterval(tickWalking, 16);
  }
  sendWalkUpdate();
}

function setLocked(nextLocked) {
  locked = nextLocked;
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setIgnoreMouseEvents(locked, { forward: true });
  petWindow.webContents.send("lock:update", { locked });
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setToolTip(locked ? "Cat desktop pet: locked" : "Cat desktop pet: unlocked");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: locked ? "解锁拖动" : "锁定并鼠标穿透",
        click: () => setLocked(!locked)
      },
      {
        label: "移到右下角",
        enabled: !locked,
        click: () => {
          stopWalking();
          petWindow?.setBounds(getInitialBounds());
          sendCursorUpdate();
        }
      },
      { type: "separator" },
      { label: "退出", role: "quit" }
    ])
  );
}

async function createWindow() {
  petWindow = new BrowserWindow({
    ...getInitialBounds(),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setMenuBarVisibility(false);

  // Fallback: show window after 5s even if ready-to-show never fires
  let shown = false;
  const showWindow = () => {
    if (shown) return;
    shown = true;
    if (process.platform === "win32") {
      petWindow.show();
    } else {
      petWindow.showInactive();
    }
    sendCursorUpdate();
  };
  const showTimeout = setTimeout(showWindow, 5000);

  petWindow.once("ready-to-show", () => {
    clearTimeout(showTimeout);
    showWindow();
  });

  petWindow.webContents.on("did-fail-load", (_event, code, desc) => {
    console.error("Page load failed:", code, desc);
    clearTimeout(showTimeout);
    showWindow();
  });

  await petWindow.loadFile(path.join(root, "index.html"), {
    query: { mode: "desktop" }
  });

  petWindow.on("closed", () => {
    petWindow = undefined;
  });
}

app.whenReady().then(async () => {
  app.dock?.hide();
  tray = new Tray(makeTrayIcon());
  rebuildTrayMenu();
  await createWindow();
  cursorTimer = setInterval(sendCursorUpdate, 16);
});

app.on("before-quit", () => {
  if (cursorTimer) clearInterval(cursorTimer);
  if (walkTimer) clearInterval(walkTimer);
});

ipcMain.on("pet:action", (_event, payload) => {
  const action = payload?.action;
  if (action === "walk" || action === "run") {
    currentSpeed = action === "run" ? RUN_SPEED : WALK_SPEED;
    startWalking();
  } else {
    stopWalking();
  }
});

app.on("window-all-closed", () => {});
