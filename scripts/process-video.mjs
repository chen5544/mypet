import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { PNG } from "pngjs";
import {
  ANGLE_ANCHORS,
  ASSET_FRAME_SIZE,
  HEAD_CENTER,
  IDLE_FRAME,
  IDLE_RADIUS,
  SOURCE_FRAME_COUNT
} from "../src/angle-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputVideo =
  process.argv[2] ||
  "/Users/chen/Downloads/jimeng-2026-06-13-9739-图一的小猫 按照 图二的说明，头部上下左右转一圈，身体不动，固定镜头，保留原本的....mp4";

const extractedDir = path.join(root, "extracted_frames");
const transparentDir = path.join(root, "public", "assets", "transparent_frames");
const spritesDir = path.join(root, "public", "assets", "sprites");
const manifestPath = path.join(root, "public", "assets", "cat-manifest.json");
const contactSheetPath = path.join(root, "contact_sheet.png");

const RAW_WIDTH = 960;
const RAW_HEIGHT = 960;
const SPRITE_COLUMNS = 13;
const SPRITE_ROWS = Math.ceil(SOURCE_FRAME_COUNT / SPRITE_COLUMNS);
const GREEN_KEY = [56, 166, 35];
const GREEN_SCALE = [46, 34, 46];
const REMOVE_ALL_GREEN_PIXELS = true;

function ensureCleanDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with exit code ${result.status}`);
  }
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function featherAlpha(alpha, width, height) {
  const out = new Uint8Array(alpha.length);
  const kernel = [
    [1, 2, 1],
    [2, 8, 2],
    [1, 2, 1]
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = alpha[y * width + x];
      if (center === 0 || center === 255) {
        out[y * width + x] = center;
        continue;
      }
      let total = 0;
      let weight = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const w = kernel[ky + 1][kx + 1];
          const sx = Math.max(0, Math.min(width - 1, x + kx));
          const sy = Math.max(0, Math.min(height - 1, y + ky));
          weight += w;
          total += alpha[sy * width + sx] * w;
        }
      }
      out[y * width + x] = Math.round(total / weight);
    }
  }
  return out;
}

const LANCZOS_A = 3;

function sinc(x) {
  if (Math.abs(x) < 1e-6) return 1;
  const v = Math.PI * x;
  return Math.sin(v) / v;
}

function lanczos3(x) {
  if (Math.abs(x) < 1e-6) return 1;
  if (Math.abs(x) >= LANCZOS_A) return 0;
  return sinc(x) * sinc(x / LANCZOS_A);
}

function resizeLanczos3(src, targetSize) {
  const dst = new PNG({ width: targetSize, height: targetSize, colorType: 6 });
  const xScale = src.width / targetSize;
  const yScale = src.height / targetSize;

  for (let dy = 0; dy < targetSize; dy += 1) {
    const sy = (dy + 0.5) * yScale - 0.5;
    const y0 = Math.max(0, Math.ceil(sy - LANCZOS_A));
    const y1 = Math.min(src.height - 1, Math.floor(sy + LANCZOS_A));

    for (let dx = 0; dx < targetSize; dx += 1) {
      const sx = (dx + 0.5) * xScale - 0.5;
      const x0 = Math.max(0, Math.ceil(sx - LANCZOS_A));
      const x1 = Math.min(src.width - 1, Math.floor(sx + LANCZOS_A));

      let r = 0, g = 0, b = 0, a = 0;
      let weightSum = 0;

      for (let syi = y0; syi <= y1; syi += 1) {
        const wy = lanczos3((syi - sy) / yScale);
        if (wy === 0) continue;
        for (let sxi = x0; sxi <= x1; sxi += 1) {
          const wx = lanczos3((sxi - sx) / xScale);
          if (wx === 0) continue;
          const w = wy * wx;
          const si = (syi * src.width + sxi) * 4;
          r += src.data[si] * w;
          g += src.data[si + 1] * w;
          b += src.data[si + 2] * w;
          a += src.data[si + 3] * w;
          weightSum += w;
        }
      }

      const di = (dy * targetSize + dx) * 4;
      const inv = weightSum > 0 ? 1 / weightSum : 1;
      dst.data[di] = Math.max(0, Math.min(255, Math.round(r * inv)));
      dst.data[di + 1] = Math.max(0, Math.min(255, Math.round(g * inv)));
      dst.data[di + 2] = Math.max(0, Math.min(255, Math.round(b * inv)));
      dst.data[di + 3] = Math.max(0, Math.min(255, Math.round(a * inv)));
    }
  }
  return dst;
}

function isVisibleGreenPixel(r, g, b) {
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
  return g > 45 && g >= r + 4 && g >= b + 4 && saturation > 0.08;
}

function clearVisibleGreenPixels(png) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] === 0) continue;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (isVisibleGreenPixel(r, g, b)) {
        png.data[i + 3] = 0;
      }
    }
  }
}

function averageVisibleNeighbor(png, x, y, radius) {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalA = 0;
  let count = 0;

  for (let yy = Math.max(0, y - radius); yy <= Math.min(png.height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(png.width - 1, x + radius); xx += 1) {
      const i = (yy * png.width + xx) * 4;
      const a = png.data[i + 3];
      if (a <= 48) continue;
      totalR += png.data[i];
      totalG += png.data[i + 1];
      totalB += png.data[i + 2];
      totalA += a;
      count += 1;
    }
  }

  if (count === 0) return null;
  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
    a: Math.round(totalA / count)
  };
}

function fillSmallTransparentHoles(png) {
  const transparentThreshold = 16;
  const maxHolePixels = Math.max(24, Math.round(png.width * png.height * 0.003));
  const visited = new Uint8Array(png.width * png.height);
  const stack = [];

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const start = y * png.width + x;
      if (visited[start] || png.data[start * 4 + 3] > transparentThreshold) continue;

      let touchesEdge = false;
      let tooLarge = false;
      const component = [];
      visited[start] = 1;
      stack.push(start);

      while (stack.length > 0) {
        const index = stack.pop();
        const px = index % png.width;
        const py = Math.floor(index / png.width);
        if (px === 0 || py === 0 || px === png.width - 1 || py === png.height - 1) {
          touchesEdge = true;
        }
        if (component.length <= maxHolePixels) {
          component.push(index);
        } else {
          tooLarge = true;
        }

        const neighbors = [index - 1, index + 1, index - png.width, index + png.width];
        for (const next of neighbors) {
          if (next < 0 || next >= visited.length || visited[next]) continue;
          const nx = next % png.width;
          if ((next === index - 1 && nx !== px - 1) || (next === index + 1 && nx !== px + 1)) continue;
          if (png.data[next * 4 + 3] > transparentThreshold) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      if (touchesEdge || tooLarge || component.length === 0) continue;
      for (const index of component) {
        const px = index % png.width;
        const py = Math.floor(index / png.width);
        const fill = averageVisibleNeighbor(png, px, py, 5);
        if (!fill) continue;
        const i = index * 4;
        png.data[i] = fill.r;
        png.data[i + 1] = fill.g;
        png.data[i + 2] = fill.b;
        png.data[i + 3] = fill.a;
      }
    }
  }
}

const DIGITS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "001", "001"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"]
};

function putPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function drawDigit(png, digit, x0, y0, scale, color) {
  const glyph = DIGITS[digit];
  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] !== "1") continue;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          putPixel(png, x0 + x * scale + xx, y0 + y * scale + yy, ...color);
        }
      }
    }
  }
}

function drawFrameLabel(png, label, x0, y0) {
  const scale = 3;
  const glyphWidth = 3 * scale;
  const gap = 3;
  [...label].forEach((digit, index) => {
    drawDigit(png, digit, x0 + index * (glyphWidth + gap), y0, scale, [225, 229, 235, 255]);
  });
}

function chromaKeyFrame(inputPath, outputPath) {
  const source = PNG.sync.read(readFileSync(inputPath));
  const alpha = new Uint8Array(source.width * source.height);
  const out = new PNG({ width: source.width, height: source.height, colorType: 6 });

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = (y * source.width + x) * 4;
      const r = source.data[i];
      const g = source.data[i + 1];
      const b = source.data[i + 2];
      const dr = (r - GREEN_KEY[0]) / GREEN_SCALE[0];
      const dg = (g - GREEN_KEY[1]) / GREEN_SCALE[1];
      const db = (b - GREEN_KEY[2]) / GREEN_SCALE[2];
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      const greenDominance = g - Math.max(r, b);
      const distanceScore = 1 - smoothstep(0.75, 2.45, distance);
      const dominanceScore = smoothstep(18, 78, greenDominance);
      const greenOverRed = g / Math.max(1, r);
      const greenOverBlue = g / Math.max(1, b);
      const isGreenPixel = REMOVE_ALL_GREEN_PIXELS && isVisibleGreenPixel(r, g, b);
      const shadowScore =
        smoothstep(24, 52, greenDominance) *
        smoothstep(92, 132, g) *
        smoothstep(1.14, 1.32, greenOverRed) *
        smoothstep(1.16, 1.36, greenOverBlue) *
        (1 - smoothstep(2.0, 4.1, distance));
      const backgroundScore = Math.max(distanceScore * dominanceScore, shadowScore);
      let a = Math.round(255 * (1 - backgroundScore));
      if (isGreenPixel) a = 0;
      if (shadowScore > 0.78) a = 0;
      if (backgroundScore > 0.92) a = 0;
      if (backgroundScore < 0.1) a = 255;
      alpha[y * source.width + x] = a;
    }
  }

  const softened = featherAlpha(alpha, source.width, source.height);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = (y * source.width + x) * 4;
      const a = softened[y * source.width + x];
      const r = source.data[i];
      const g = source.data[i + 1];
      const b = source.data[i + 2];
      const excessGreen = Math.max(0, g - Math.max(r, b));
      const despill = a < 255 ? Math.round(excessGreen * 0.72) : 0;
      out.data[i] = r;
      out.data[i + 1] = Math.max(0, g - despill);
      out.data[i + 2] = b;
      out.data[i + 3] = a;
    }
  }

  if (REMOVE_ALL_GREEN_PIXELS) {
    clearVisibleGreenPixels(out);
  }
  fillSmallTransparentHoles(out);
  if (REMOVE_ALL_GREEN_PIXELS) {
    clearVisibleGreenPixels(out);
  }
  const resized = resizeLanczos3(out, ASSET_FRAME_SIZE);
  if (REMOVE_ALL_GREEN_PIXELS) {
    clearVisibleGreenPixels(resized);
  }
  fillSmallTransparentHoles(resized);
  if (REMOVE_ALL_GREEN_PIXELS) {
    clearVisibleGreenPixels(resized);
  }
  writeFileSync(outputPath, PNG.sync.write(resized));

  let minX = source.width;
  let minY = source.height;
  let maxX = 0;
  let maxY = 0;
  let transparent = 0;
  let opaque = 0;
  let semi = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const a = softened[y * source.width + x];
      if (a < 5) transparent += 1;
      else if (a > 250) opaque += 1;
      else semi += 1;
      if (a > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    }
  }

  return {
    bbox: [minX, minY, maxX, maxY],
    transparentRatio: transparent / (source.width * source.height),
    opaqueRatio: opaque / (source.width * source.height),
    semiRatio: semi / (source.width * source.height)
  };
}

function makeContactSheet(frameFiles) {
  const thumb = 132;
  const labelHeight = 22;
  const pad = 6;
  const cols = 13;
  const rows = Math.ceil(frameFiles.length / cols);
  const sheet = new PNG({
    width: cols * (thumb + pad) + pad,
    height: rows * (thumb + labelHeight + pad) + pad,
    colorType: 6
  });
  sheet.data.fill(255);
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 28;
    sheet.data[i + 1] = 29;
    sheet.data[i + 2] = 33;
    sheet.data[i + 3] = 255;
  }

  frameFiles.forEach((file, index) => {
    const src = resizeLanczos3(PNG.sync.read(readFileSync(file)), thumb);
    const x0 = pad + (index % cols) * (thumb + pad);
    const y0 = pad + Math.floor(index / cols) * (thumb + labelHeight + pad);
    for (let y = 0; y < thumb; y += 1) {
      for (let x = 0; x < thumb; x += 1) {
        const si = (y * thumb + x) * 4;
        const di = ((y0 + y) * sheet.width + (x0 + x)) * 4;
        sheet.data[di] = src.data[si];
        sheet.data[di + 1] = src.data[si + 1];
        sheet.data[di + 2] = src.data[si + 2];
        sheet.data[di + 3] = 255;
      }
    }
    for (let y = y0 + thumb; y < y0 + thumb + labelHeight; y += 1) {
      for (let x = x0; x < x0 + thumb; x += 1) {
        const di = (y * sheet.width + x) * 4;
        sheet.data[di] = 14;
        sheet.data[di + 1] = 15;
        sheet.data[di + 2] = 18;
        sheet.data[di + 3] = 255;
      }
    }
    drawFrameLabel(sheet, String(index + 1).padStart(4, "0"), x0 + 7, y0 + thumb + 4);
  });
  writeFileSync(contactSheetPath, PNG.sync.write(sheet));
}

function makeSprite(frameFiles) {
  const sprite = new PNG({
    width: SPRITE_COLUMNS * ASSET_FRAME_SIZE,
    height: SPRITE_ROWS * ASSET_FRAME_SIZE,
    colorType: 6
  });
  sprite.data.fill(0);

  frameFiles.forEach((file, index) => {
    const frame = PNG.sync.read(readFileSync(file));
    const col = index % SPRITE_COLUMNS;
    const row = Math.floor(index / SPRITE_COLUMNS);
    const x0 = col * ASSET_FRAME_SIZE;
    const y0 = row * ASSET_FRAME_SIZE;
    for (let y = 0; y < ASSET_FRAME_SIZE; y += 1) {
      for (let x = 0; x < ASSET_FRAME_SIZE; x += 1) {
        const si = (y * frame.width + x) * 4;
        const di = ((y0 + y) * sprite.width + (x0 + x)) * 4;
        sprite.data[di] = frame.data[si];
        sprite.data[di + 1] = frame.data[si + 1];
        sprite.data[di + 2] = frame.data[si + 2];
        sprite.data[di + 3] = frame.data[si + 3];
      }
    }
  });

  const spritePath = path.join(spritesDir, "cat-directions.png");
  writeFileSync(spritePath, PNG.sync.write(sprite));
  return spritePath;
}

function main() {
  mkdirSync(path.join(root, "public", "assets"), { recursive: true });
  ensureCleanDir(extractedDir);
  ensureCleanDir(transparentDir);
  mkdirSync(spritesDir, { recursive: true });

  runFfmpeg([
    "-hide_banner",
    "-y",
    "-i",
    inputVideo,
    "-fps_mode",
    "passthrough",
    path.join(extractedDir, "frame_%04d.png")
  ]);

  const rawFrames = readdirSync(extractedDir)
    .filter((file) => /^frame_\d+\.png$/.test(file))
    .sort()
    .map((file) => path.join(extractedDir, file));

  if (rawFrames.length !== SOURCE_FRAME_COUNT) {
    throw new Error(`Expected ${SOURCE_FRAME_COUNT} frames, got ${rawFrames.length}.`);
  }

  makeContactSheet(rawFrames);

  const stats = [];
  const transparentFrames = rawFrames.map((file, index) => {
    const out = path.join(transparentDir, `cat_${String(index + 1).padStart(4, "0")}.png`);
    stats.push(chromaKeyFrame(file, out));
    return out;
  });

  const spritePath = makeSprite(transparentFrames);
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceVideo: inputVideo,
    sourceHasAlpha: false,
    alphaMethod:
      "Original MP4 is H.264 yuv420p with no true alpha. Transparent frames were generated by aggressive green pixel removal, green-screen chroma keying, feathered alpha edges, small internal alpha-hole repair, and green spill suppression.",
    frameCount: SOURCE_FRAME_COUNT,
    rawFrameSize: { width: RAW_WIDTH, height: RAW_HEIGHT },
    assetFrameSize: { width: ASSET_FRAME_SIZE, height: ASSET_FRAME_SIZE },
    sprite: {
      file: "sprites/cat-directions.png",
      columns: SPRITE_COLUMNS,
      rows: SPRITE_ROWS,
      frameWidth: ASSET_FRAME_SIZE,
      frameHeight: ASSET_FRAME_SIZE
    },
    transparentFramesPattern: "transparent_frames/cat_%04d.png",
    contactSheet: "../contact_sheet.png",
    headCenter: HEAD_CENTER,
    idleFrame: IDLE_FRAME,
    idleRadius: IDLE_RADIUS,
    angleAnchors: ANGLE_ANCHORS,
    keyingStats: {
      sampledFrames: [1, 57, 85, 117, 141, 169].map((frame) => ({
        frame,
        ...stats[frame - 1]
      }))
    }
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Processed ${rawFrames.length} frames`);
  console.log(`Contact sheet: ${contactSheetPath}`);
  console.log(`Transparent frames: ${transparentDir}`);
  console.log(`Sprite: ${spritePath}`);
  console.log(`Manifest: ${manifestPath}`);
}

main();
