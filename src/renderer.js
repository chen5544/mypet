import {
  HEAD_CENTER,
  IDLE_FRAME,
  IDLE_RADIUS,
  PET_WINDOW,
  SOURCE_FRAME_SIZE,
  SOURCE_FRAME_COUNT,
  frameForAngle,
  normalizeAngle,
  shortestAngleDelta,
  spritePositionForFrame
} from "./angle-config.js";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "desktop" ? "desktop" : "preview";

const app = document.querySelector("#app");
app.dataset.mode = mode;
app.style.setProperty("--pet-size", `${PET_WINDOW.width}px`);
app.style.setProperty("--sprite-size", `${PET_WINDOW.width * 13}px`);

const root = document.createElement("main");
root.className = "pet-root";
root.innerHTML = `
  <section class="pet-stage" aria-label="Cat desktop pet preview">
    <div class="cat-wrap" data-locked="false">
      <div class="cat-frame cat-frame-a"></div>
      <div class="cat-frame cat-frame-b"></div>
    </div>
  </section>
  <div class="pet-actions" aria-label="Pet actions">
    <button class="pet-action-button pos-top" type="button" data-action="tracking" title="跟随">👀</button>
    <button class="pet-action-button pos-top-right" type="button" data-action="run" title="奔跑">🏃</button>
    <button class="pet-action-button pos-right" type="button" data-action="play" title="玩耍">🎾</button>
    <button class="pet-action-button pos-bottom-right" type="button" data-action="jump" title="跳跃">🦘</button>
    <button class="pet-action-button pos-bottom" type="button" data-action="walk" title="行走">🚶</button>
    <button class="pet-action-button pos-bottom-left" type="button" data-action="wash" title="洗脸">🧼</button>
    <button class="pet-action-button pos-left" type="button" data-action="eat" title="吃饭">🍽️</button>
    <button class="pet-action-button pos-top-left" type="button" data-action="sleep" title="睡觉">😴</button>
  </div>
  <aside class="debug-panel">
    <div class="debug-row"><span>angle</span><strong data-debug="angle">0</strong></div>
    <div class="debug-row"><span>frame</span><strong data-debug="frame">117</strong></div>
    <div class="debug-row"><span>distance</span><strong data-debug="distance">0</strong></div>
    <div class="debug-row"><span>state</span><strong data-debug="state">idle</strong></div>
  </aside>
`;
app.append(root);

const stage = root.querySelector(".pet-stage");
const catWrap = root.querySelector(".cat-wrap");
const layerA = root.querySelector(".cat-frame-a");
const layerB = root.querySelector(".cat-frame-b");
const actionButtons = [...root.querySelectorAll("button[data-action]")];
const debug = {
  angle: root.querySelector('[data-debug="angle"]'),
  frame: root.querySelector('[data-debug="frame"]'),
  distance: root.querySelector('[data-debug="distance"]'),
  state: root.querySelector('[data-debug="state"]')
};

const state = {
  pointer: { x: 0, y: 0 },
  hasPointer: false,
  currentAngle: 180,
  currentFrame: IDLE_FRAME,
  targetFrame: IDLE_FRAME,
  targetAngle: 180,
  distance: 0,
  locked: false,
  idle: true,
  action: "tracking",
  actionFrame: 1,
  actionStartedAt: 0,
  actionsDismissed: false,
  transitionUntil: 0,
  walkDirection: "right"
};

const spriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-directions.png", import.meta.url).href
    : "/assets/sprites/cat-directions.png";
const runSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-run.png", import.meta.url).href
    : "/assets/sprites/cat-run.png";
const runLeftSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-runLeft.png", import.meta.url).href
    : "/assets/sprites/cat-runLeft.png";
const eatSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-eat.png", import.meta.url).href
    : "/assets/sprites/cat-eat.png";
const playSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-play.png", import.meta.url).href
    : "/assets/sprites/cat-play.png";
const jumpSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-jump.png", import.meta.url).href
    : "/assets/sprites/cat-jump.png";
const sleepSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-sleep.png", import.meta.url).href
    : "/assets/sprites/cat-sleep.png";
const walkRightSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-walkRight.png", import.meta.url).href
    : "/assets/sprites/cat-walkRight.png";
const walkLeftSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-walkLeft.png", import.meta.url).href
    : "/assets/sprites/cat-walkLeft.png";
const washSpriteUrl =
  mode === "desktop" || window.location.protocol === "file:"
    ? new URL("../public/assets/sprites/cat-wash.png", import.meta.url).href
    : "/assets/sprites/cat-wash.png";

const actionSprites = {
  runRight: runSpriteUrl,
  runLeft: runLeftSpriteUrl,
  eat: eatSpriteUrl,
  play: playSpriteUrl,
  jump: jumpSpriteUrl,
  sleep: sleepSpriteUrl,
  walkRight: walkRightSpriteUrl,
  walkLeft: walkLeftSpriteUrl,
  wash: washSpriteUrl
};

const actionLabels = {
  tracking: "tracking",
  runRight: "running right",
  runLeft: "running left",
  eat: "eating",
  play: "playing",
  jump: "jumping",
  sleep: "sleeping",
  walk: "walking",
  wash: "washing"
};

const actionFps = {
  runRight: 28,
  runLeft: 28,
  eat: 28,
  play: 28,
  jump: 56,
  sleep: 28,
  walk: 24,
  wash: 28
};

const spriteFrameCounts = {
  tracking: SOURCE_FRAME_COUNT,
  runRight: SOURCE_FRAME_COUNT,
  runLeft: SOURCE_FRAME_COUNT,
  eat: SOURCE_FRAME_COUNT,
  play: SOURCE_FRAME_COUNT,
  jump: SOURCE_FRAME_COUNT,
  sleep: SOURCE_FRAME_COUNT,
  walkRight: 193,
  walkLeft: 193,
  wash: 241
};

let activeSprite = "";

function frameCountForSprite(sprite) {
  return spriteFrameCounts[sprite] || SOURCE_FRAME_COUNT;
}

function setSpriteFrame(layer, frame, frameCount = SOURCE_FRAME_COUNT) {
  const rows = Math.ceil(frameCount / 13);
  const pos =
    frameCount === SOURCE_FRAME_COUNT
      ? spritePositionForFrame(frame)
      : {
          col: ((Math.round(frame) - 1) % 13 + 13) % 13,
          row: Math.floor((((Math.round(frame) - 1) % frameCount) + frameCount) % frameCount / 13)
        };
  const x = (pos.col / 12) * 100;
  const y = rows === 1 ? 0 : (pos.row / (rows - 1)) * 100;
  layer.style.backgroundPosition = `${x}% ${y}%`;
}

function setLayerSprite(sprite) {
  if (activeSprite === sprite) return;
  activeSprite = sprite;
  const url = actionSprites[sprite] || spriteUrl;
  const frameCount = frameCountForSprite(sprite);
  const rows = Math.ceil(frameCount / 13);
  for (const layer of [layerA, layerB]) {
    layer.style.backgroundImage = `url("${url}")`;
    layer.style.backgroundSize = `${PET_WINDOW.width * 13}px ${PET_WINDOW.height * rows}px`;
  }
}

function beginActionTransition() {
  state.transitionUntil = performance.now() + 260;
}

function dismissActionsUntilRehover() {
  state.actionsDismissed = true;
  root.dataset.actionsDismissed = "true";
}

function showActionsOnNextHover() {
  state.actionsDismissed = false;
  root.dataset.actionsDismissed = "false";
}

function selectAction(action) {
  beginActionTransition();
  dismissActionsUntilRehover();

  if (action === "tracking") {
    window.desktopPet?.setAction?.("tracking");
    state.action = "tracking";
    state.actionFrame = 1;
    state.actionStartedAt = 0;
    state.currentAngle = 180;
    state.targetAngle = 180;
    state.currentFrame = IDLE_FRAME;
    state.targetFrame = IDLE_FRAME;
    state.idle = true;
    return;
  }

  if (action !== "walk" && action !== "run" && !actionSprites[action]) return;
  window.desktopPet?.setAction?.(action);
  state.action = action;
  state.actionFrame = 1;
  state.actionStartedAt = performance.now();
  state.currentFrame = 1;
}

function wrapFrame(frame) {
  return ((frame - 1) % SOURCE_FRAME_COUNT + SOURCE_FRAME_COUNT) % SOURCE_FRAME_COUNT + 1;
}

function wrapActionFrame(frame, frameCount) {
  return ((frame - 1) % frameCount + frameCount) % frameCount + 1;
}

function shortestFrameDelta(from, to) {
  return ((to - from + SOURCE_FRAME_COUNT * 1.5) % SOURCE_FRAME_COUNT) - SOURCE_FRAME_COUNT / 2;
}

function mixFrame(from, to, amount) {
  return wrapFrame(from + shortestFrameDelta(from, to) * amount);
}

function angleFromVector(dx, dy) {
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}

function petHeadScreenCenter(windowBounds) {
  return {
    x: windowBounds.x + (HEAD_CENTER.x / SOURCE_FRAME_SIZE) * windowBounds.width,
    y: windowBounds.y + (HEAD_CENTER.y / SOURCE_FRAME_SIZE) * windowBounds.height
  };
}

function updateTargetFromDesktop(payload) {
  state.locked = payload.locked;
  if (state.action !== "tracking") return;
  const center = petHeadScreenCenter(payload.windowBounds);
  const dx = payload.cursor.x - center.x;
  const dy = payload.cursor.y - center.y;
  state.distance = Math.hypot(dx, dy);
  state.idle = state.distance <= (IDLE_RADIUS / SOURCE_FRAME_SIZE) * payload.windowBounds.width;
  if (state.idle) {
    state.targetFrame = IDLE_FRAME;
  } else {
    state.targetAngle = angleFromVector(dx, dy);
    state.targetFrame = frameForAngle(state.targetAngle);
  }
}

function updateTargetFromPreview() {
  if (state.action !== "tracking") return;
  const rect = stage.getBoundingClientRect();
  const center = {
    x: rect.left + (HEAD_CENTER.x / SOURCE_FRAME_SIZE) * rect.width,
    y: rect.top + (HEAD_CENTER.y / SOURCE_FRAME_SIZE) * rect.height
  };
  const pointer = state.hasPointer
    ? state.pointer
    : { x: center.x, y: center.y + IDLE_RADIUS * 1.8 };
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  state.distance = Math.hypot(dx, dy);
  state.idle = state.distance <= (IDLE_RADIUS / SOURCE_FRAME_SIZE) * rect.width;
  if (state.idle) {
    state.targetFrame = IDLE_FRAME;
  } else {
    state.targetAngle = angleFromVector(dx, dy);
    state.targetFrame = frameForAngle(state.targetAngle);
  }
}

function render() {
  if (mode === "preview") {
    updateTargetFromPreview();
  }

  let currentFrameCount = SOURCE_FRAME_COUNT;
  if (state.action !== "tracking") {
    const spriteName = (state.action === "walk" || state.action === "run")
      ? `${state.action}${state.walkDirection === "right" ? "Right" : "Left"}`
      : state.action;
    setLayerSprite(spriteName);
    currentFrameCount = frameCountForSprite(spriteName);
    const elapsed = performance.now() - state.actionStartedAt;
    state.actionFrame = wrapActionFrame(
      1 + (elapsed / 1000) * (actionFps[state.action] || 28),
      currentFrameCount
    );
    state.currentFrame = state.actionFrame;
  } else {
    setLayerSprite("tracking");
    state.currentAngle = normalizeAngle(
      state.currentAngle + shortestAngleDelta(state.currentAngle, state.targetAngle) * 0.22
    );
    state.currentFrame = mixFrame(state.currentFrame, state.targetFrame, 0.24);
  }

  const displayFrame = wrapActionFrame(Math.round(state.currentFrame), currentFrameCount);

  setSpriteFrame(layerA, displayFrame, currentFrameCount);
  setSpriteFrame(layerB, displayFrame, currentFrameCount);
  layerA.style.opacity = "1";
  layerB.style.opacity = "0";
  catWrap.dataset.locked = String(state.locked);
  root.dataset.actionState = state.action;
  root.dataset.actionsDismissed = String(state.actionsDismissed);
  root.dataset.transitioning = String(performance.now() < state.transitionUntil);
  root.dataset.locked = String(state.locked);

  if (mode === "preview") {
    debug.angle.textContent = `${Math.round(state.targetAngle)} deg`;
    debug.frame.textContent = state.currentFrame.toFixed(2);
    debug.distance.textContent = `${Math.round(state.distance)} px`;
    debug.state.textContent = actionLabels[state.action] || (state.idle ? "idle" : "tracking");
  }

  requestAnimationFrame(render);
}

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectAction(button.dataset.action);
  });
});

stage.addEventListener("pointerleave", () => {
  pointerDown = null;
  showActionsOnNextHover();
});

stage.addEventListener("pointerenter", () => {
  showActionsOnNextHover();
});

// Right-click to summon action menu when it's been dismissed
stage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (state.locked) return;
  showActionsOnNextHover();
});

// Click cat while walking → tracking
let walkPointerDown = null;

function handleWalkPointerDown(event) {
  if (state.locked) return;
  if (state.action !== "walk" && state.action !== "run") return;
  if (event.target.closest(".pet-action-button")) return;
  walkPointerDown = { x: event.clientX, y: event.clientY };
}

function handleWalkPointerUp(event) {
  if (!walkPointerDown) return;
  const dx = event.clientX - walkPointerDown.x;
  const dy = event.clientY - walkPointerDown.y;
  walkPointerDown = null;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return;
  if (state.action !== "walk" && state.action !== "run") return;
  if (event.target.closest(".pet-action-button")) return;
  selectAction("tracking");
}

stage.addEventListener("pointerdown", handleWalkPointerDown);
stage.addEventListener("pointerup", handleWalkPointerUp);

// Also listen on actions container for when it blocks events
const actionsEl = root.querySelector(".pet-actions");
actionsEl.addEventListener("pointerdown", handleWalkPointerDown);
actionsEl.addEventListener("pointerup", handleWalkPointerUp);

if (mode === "desktop" && window.desktopPet) {
  window.desktopPet.onCursorUpdate(updateTargetFromDesktop);
  window.desktopPet.onLockUpdate(({ locked }) => {
    state.locked = locked;
  });
  window.desktopPet.onWalkUpdate(({ direction, phase }) => {
    if (direction === "right" || direction === "left") {
      state.walkDirection = direction;
    }
    root.dataset.walkPhase = phase || "";
  });
}

if (mode === "preview") {
  window.addEventListener("pointermove", (event) => {
    state.pointer = { x: event.clientX, y: event.clientY };
    state.hasPointer = true;
  });
  window.addEventListener("pointerleave", () => {
    state.hasPointer = false;
  });
}

setSpriteFrame(layerA, IDLE_FRAME);
setSpriteFrame(layerB, IDLE_FRAME + 1);
setLayerSprite("tracking");
render();
