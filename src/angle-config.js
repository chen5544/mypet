export const HEAD_CENTER = { x: 314, y: 202 };

export const IDLE_RADIUS = 120;

export const PET_WINDOW = {
  width: 280,
  height: 280,
  marginRight: 28,
  marginBottom: 28
};

export const ASSET_FRAME_SIZE = 512;

export const SOURCE_FRAME_SIZE = 960;

export const SOURCE_FRAME_COUNT = 169;

export const ANGLE_KEYS = [
  0,
  18,
  38,
  58,
  75,
  92,
  128,
  160,
  180,
  218,
  252,
  286,
  320,
  340,
  360
];

export const ANGLE_ANCHORS = [
  { angle: 0, frame: 169, label: "up / 12 o'clock" },
  { angle: 18, frame: 1, label: "loop into first frame" },
  { angle: 38, frame: 25, label: "upper-right front" },
  { angle: 58, frame: 45, label: "up-right" },
  { angle: 75, frame: 57, label: "right-up" },
  { angle: 92, frame: 81, label: "right" },
  { angle: 128, frame: 97, label: "right-down" },
  { angle: 160, frame: 109, label: "down-right" },
  { angle: 180, frame: 117, label: "down/front idle" },
  { angle: 218, frame: 129, label: "down-left" },
  { angle: 252, frame: 141, label: "left" },
  { angle: 286, frame: 149, label: "left-up" },
  { angle: 320, frame: 161, label: "up-left / 11 o'clock" },
  { angle: 340, frame: 165, label: "up-left to up transition" },
  { angle: 360, frame: 169, label: "up loop / 12 o'clock" }
];

export const IDLE_FRAME = 117;

export function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

export function findAnchorSpan(angle) {
  const normalized = normalizeAngle(angle);
  for (let i = 0; i < ANGLE_ANCHORS.length - 1; i += 1) {
    const left = ANGLE_ANCHORS[i];
    const right = ANGLE_ANCHORS[i + 1];
    if (normalized >= left.angle && normalized <= right.angle) {
      return { left, right };
    }
  }
  return {
    left: ANGLE_ANCHORS[ANGLE_ANCHORS.length - 2],
    right: ANGLE_ANCHORS[ANGLE_ANCHORS.length - 1]
  };
}

export function frameForAngle(angle) {
  const normalized = normalizeAngle(angle);
  const { left, right } = findAnchorSpan(normalized);
  const span = Math.max(1, right.angle - left.angle);
  const t = (normalized - left.angle) / span;
  let rightFrame = right.frame;
  if (rightFrame < left.frame) {
    rightFrame += SOURCE_FRAME_COUNT;
  }
  const frame = left.frame + (rightFrame - left.frame) * t;
  return ((frame - 1) % SOURCE_FRAME_COUNT) + 1;
}

export function spritePositionForFrame(frame) {
  const wrapped = ((Math.round(frame) - 1) % SOURCE_FRAME_COUNT + SOURCE_FRAME_COUNT) % SOURCE_FRAME_COUNT;
  const index = wrapped;
  return {
    index,
    col: index % 13,
    row: Math.floor(index / 13)
  };
}
