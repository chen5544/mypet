import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import {
  ANGLE_ANCHORS,
  ASSET_FRAME_SIZE,
  HEAD_CENTER,
  IDLE_FRAME,
  IDLE_RADIUS,
  SOURCE_FRAME_COUNT,
  frameForAngle
} from "../src/angle-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACTIONS = {
  run: { label: "Run", frameCount: 169, minTransparentRatio: 0.7, minOpaqueRatio: 0.14 },
  eat: { label: "Eat", frameCount: 169, minTransparentRatio: 0.45, minOpaqueRatio: 0.25 },
  play: { label: "Play", frameCount: 169, minTransparentRatio: 0.45, minOpaqueRatio: 0.12 },
  jump: { label: "Jump", frameCount: 169, minTransparentRatio: 0.45, minOpaqueRatio: 0.12 },
  sleep: { label: "Sleep", frameCount: 169, minTransparentRatio: 0.45, minOpaqueRatio: 0.12 },
  walkRight: { label: "Walk right", frameCount: 193, minTransparentRatio: 0.45, minOpaqueRatio: 0.08 },
  walkLeft: { label: "Walk left", frameCount: 193, minTransparentRatio: 0.45, minOpaqueRatio: 0.08 },
  wash: { label: "Wash", frameCount: 241, minTransparentRatio: 0.45, minOpaqueRatio: 0.12 }
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function listPngs(dir, prefix) {
  assert(existsSync(dir), `Missing directory: ${dir}`);
  return readdirSync(dir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".png"))
    .sort();
}

function readPng(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(existsSync(fullPath), `Missing file: ${relativePath}`);
  return PNG.sync.read(readFileSync(fullPath));
}

function circularForwardDelta(from, to) {
  return ((to - from) % SOURCE_FRAME_COUNT + SOURCE_FRAME_COUNT) % SOURCE_FRAME_COUNT;
}

function validateFiles() {
  assert(existsSync(path.join(root, "contact_sheet.png")), "Missing contact_sheet.png");
  assert(existsSync(path.join(root, "head_calibration_sheet.png")), "Missing head_calibration_sheet.png");
  assert(existsSync(path.join(root, "public/assets/cat-manifest.json")), "Missing cat-manifest.json");

  const rawFrames = listPngs(path.join(root, "extracted_frames"), "frame_");
  const transparentFrames = listPngs(path.join(root, "public/assets/transparent_frames"), "cat_");
  assert(rawFrames.length === SOURCE_FRAME_COUNT, `Expected ${SOURCE_FRAME_COUNT} raw frames, got ${rawFrames.length}`);
  assert(
    transparentFrames.length === SOURCE_FRAME_COUNT,
    `Expected ${SOURCE_FRAME_COUNT} transparent frames, got ${transparentFrames.length}`
  );

  const sprite = readPng("public/assets/sprites/cat-directions.png");
  assert(sprite.width === ASSET_FRAME_SIZE * 13, `Unexpected sprite width: ${sprite.width}`);
  assert(sprite.height === ASSET_FRAME_SIZE * 13, `Unexpected sprite height: ${sprite.height}`);

  const actionFiles = {};
  for (const [action, config] of Object.entries(ACTIONS)) {
    assert(existsSync(path.join(root, `public/assets/${action}-manifest.json`)), `Missing ${action}-manifest.json`);
    const frames = listPngs(path.join(root, `public/assets/${action}_transparent_frames`), `${action}_`);
    if (config.frameCount) {
      assert(frames.length === config.frameCount, `Expected ${config.frameCount} ${action} frames, got ${frames.length}`);
    } else {
      assert(frames.length >= config.minFrameCount, `Expected at least ${config.minFrameCount} ${action} frames, got ${frames.length}`);
    }
    const actionSprite = readPng(`public/assets/sprites/cat-${action}.png`);
    const expectedRows = Math.ceil(frames.length / 13);
    assert(actionSprite.width === ASSET_FRAME_SIZE * 13, `Unexpected ${action} sprite width: ${actionSprite.width}`);
    assert(actionSprite.height === ASSET_FRAME_SIZE * expectedRows, `Unexpected ${action} sprite height: ${actionSprite.height}`);
    actionFiles[action] = { frames, sprite: actionSprite };
  }

  return { rawFrames, transparentFrames, sprite, actionFiles };
}

function alphaStats(relativePath, frame) {
  const png = readPng(relativePath);
  let transparent = 0;
  let opaque = 0;
  let semi = 0;
  let visible = 0;
  let visibleGreen = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    const alpha = png.data[i];
    if (alpha < 5) transparent += 1;
    else if (alpha > 250) opaque += 1;
    else semi += 1;
    if (alpha > 20) {
      const r = png.data[i - 3];
      const g = png.data[i - 2];
      const b = png.data[i - 1];
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      visible += 1;
      if (g > 45 && g >= r + 4 && g >= b + 4 && saturation > 0.08) {
        visibleGreen += 1;
      }
    }
  }
  const total = png.width * png.height;
  return {
    frame,
    transparentRatio: transparent / total,
    opaqueRatio: opaque / total,
    semiRatio: semi / total,
    visibleGreenRatio: visibleGreen / Math.max(1, visible)
  };
}

function validateAlphaSet(label, pattern, options = {}) {
  const minTransparentRatio = options.minTransparentRatio ?? 0.55;
  const minOpaqueRatio = options.minOpaqueRatio ?? 0.15;
  const frameCount = options.frameCount ?? SOURCE_FRAME_COUNT;
  const samples = [0, 0.2, 0.5, 0.7, 0.85, 1].map((ratio) =>
    Math.max(1, Math.min(frameCount, Math.round(1 + (frameCount - 1) * ratio)))
  );
  const results = samples.map((frame) => alphaStats(pattern(frame), frame));

  for (const result of results) {
    assert(
      result.transparentRatio > minTransparentRatio,
      `${label} frame ${result.frame} is not transparent enough`
    );
    assert(result.opaqueRatio > minOpaqueRatio, `${label} frame ${result.frame} may have lost the cat subject`);
    assert(result.visibleGreenRatio < 0.01, `${label} frame ${result.frame} still has visible green residue`);
  }

  return results;
}

function validateAlpha() {
  const results = {
    tracking: validateAlphaSet(
      "Tracking",
      (frame) => `public/assets/transparent_frames/cat_${String(frame).padStart(4, "0")}.png`
    )
  };
  for (const [action, config] of Object.entries(ACTIONS)) {
    const frameCount = listPngs(path.join(root, `public/assets/${action}_transparent_frames`), `${action}_`).length;
    results[action] = validateAlphaSet(
      config.label,
      (frame) => `public/assets/${action}_transparent_frames/${action}_${String(frame).padStart(4, "0")}.png`,
      {
        minTransparentRatio: config.minTransparentRatio,
        minOpaqueRatio: config.minOpaqueRatio,
        frameCount
      }
    );
  }
  return results;
}

function validateAnchors() {
  assert(ANGLE_ANCHORS[0].angle === 0, "First anchor must start at 0 degrees");
  assert(ANGLE_ANCHORS.at(-1).angle === 360, "Last anchor must close at 360 degrees");
  assert(IDLE_FRAME >= 1 && IDLE_FRAME <= SOURCE_FRAME_COUNT, "Idle frame out of range");
  assert(HEAD_CENTER.x > 0 && HEAD_CENTER.y > 0, "Head center must be positive");
  assert(IDLE_RADIUS > 0, "Idle radius must be positive");

  for (let i = 1; i < ANGLE_ANCHORS.length; i += 1) {
    assert(ANGLE_ANCHORS[i].angle > ANGLE_ANCHORS[i - 1].angle, "Anchor angles must be strictly increasing");
    assert(ANGLE_ANCHORS[i].frame >= 1, `Anchor frame too low at ${ANGLE_ANCHORS[i].label}`);
    assert(ANGLE_ANCHORS[i].frame <= SOURCE_FRAME_COUNT, `Anchor frame too high at ${ANGLE_ANCHORS[i].label}`);
  }

  const samples = [];
  let previous = frameForAngle(0);
  for (let angle = 5; angle <= 360; angle += 5) {
    const frame = frameForAngle(angle);
    const delta = circularForwardDelta(previous, frame);
    samples.push({ angle, frame, delta });
    assert(delta <= 12, `Frame jump too large near ${angle} degrees: ${previous} -> ${frame}`);
    previous = frame;
  }

  return samples;
}

const files = validateFiles();
const alpha = validateAlpha();
const samples = validateAnchors();

console.log("Asset validation passed");
console.log(`Raw frames: ${files.rawFrames.length}`);
console.log(`Transparent frames: ${files.transparentFrames.length}`);
console.log(`Sprite: ${files.sprite.width}x${files.sprite.height}`);
for (const [action, info] of Object.entries(files.actionFiles)) {
  console.log(`${action} frames: ${info.frames.length}`);
  console.log(`${action} sprite: ${info.sprite.width}x${info.sprite.height}`);
}
console.log(
  `Tracking alpha samples: ${alpha.tracking
    .map((item) => `${item.frame}:${Math.round(item.transparentRatio * 100)}% transparent`)
    .join(", ")}`
);
for (const [action, config] of Object.entries(ACTIONS)) {
  console.log(
    `${config.label} alpha samples: ${alpha[action]
      .map((item) => `${item.frame}:${Math.round(item.transparentRatio * 100)}% transparent`)
      .join(", ")}`
  );
}
console.log(`Angle samples checked: ${samples.length}`);
