import { describe, it, expect, beforeAll } from "vitest";
import { preprocessFrame, postprocessOutput, COCO_CLASSES } from "./yolo";
import { smoothBox } from "./smoothing";
import { SMOOTHING_FACTOR, YOLO_INPUT_SIZE } from "./constants";

// jsdom stubs for browser canvas APIs not available in test environment
beforeAll(() => {
  if (typeof globalThis.ImageData === "undefined") {
    class MockImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      colorSpace: PredefinedColorSpace = "srgb";
      constructor(data: Uint8ClampedArray, width: number, height?: number) {
        this.data = new Uint8ClampedArray(data);
        this.width = width;
        this.height = height ?? data.length / (width * 4);
      }
    }
    // @ts-expect-error mock
    globalThis.ImageData = MockImageData;
  }

  if (typeof globalThis.OffscreenCanvas === "undefined") {
    class MockOffscreenCanvas {
      width: number;
      height: number;
      private _data: Uint8ClampedArray;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this._data = new Uint8ClampedArray(width * height * 4);
      }

      getContext(_type: string) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return {
          fillStyle: "",
          fillRect(_x: number, _y: number, _w: number, _h: number) {
            // fill backing data with gray (114) to simulate letterbox pad
            self._data = new Uint8ClampedArray(self.width * self.height * 4).fill(114);
            for (let i = 3; i < self._data.length; i += 4) self._data[i] = 255;
          },
          putImageData(imageData: ImageData) {
            // copy pixel data
            self._data = new Uint8ClampedArray(imageData.data);
            self.width = imageData.width;
            self.height = imageData.height;
          },
          drawImage(
            _src: MockOffscreenCanvas,
            _dx: number,
            _dy: number,
            dw?: number,
            dh?: number
          ) {
            // resize: fill with averaged/sampled pixels (simplified: fill with 128)
            const w = dw ?? self.width;
            const h = dh ?? self.height;
            self.width = w;
            self.height = h;
            self._data = new Uint8ClampedArray(w * h * 4).fill(128);
            // Set alpha channel to 255
            for (let i = 3; i < self._data.length; i += 4) self._data[i] = 255;
          },
          getImageData(
            _x: number,
            _y: number,
            w: number,
            h: number
          ): ImageData {
            const data = new Uint8ClampedArray(w * h * 4);
            // copy what we have, padding with 128 if needed
            for (let i = 0; i < data.length && i < self._data.length; i++) {
              data[i] = self._data[i];
            }
            // alpha
            for (let i = 3; i < data.length; i += 4) data[i] = 255;
            return new ImageData(data, w, h);
          },
        };
      }
    }
    // @ts-expect-error mock
    globalThis.OffscreenCanvas = MockOffscreenCanvas;
  }
});

describe("preprocessFrame", () => {
  it("returns correct output length", () => {
    const width = 320;
    const height = 240;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const imageData = new ImageData(data, width, height);
    const { tensor } = preprocessFrame(imageData);
    expect(tensor.length).toBe(1 * 3 * YOLO_INPUT_SIZE * YOLO_INPUT_SIZE);
  });

  it("all values are in [0, 1]", () => {
    const width = 100;
    const height = 100;
    // Random pixel values
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    const imageData = new ImageData(data, width, height);
    const { tensor } = preprocessFrame(imageData);
    for (const val of tensor) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

describe("postprocessOutput", () => {
  it("returns a detection from a synthetic tensor with one clear detection", () => {
    const numAnchors = 8400;
    // Shape [84, 8400], flattened
    const output = new Float32Array(84 * numAnchors).fill(0);

    // Anchor index 42: place a confident cup (class 41) detection
    const anchorIdx = 42;
    const classIdx = 41; // "cup"

    // cx=320, cy=320, w=100, h=80 (center, in 640 space)
    output[0 * numAnchors + anchorIdx] = 320;
    output[1 * numAnchors + anchorIdx] = 320;
    output[2 * numAnchors + anchorIdx] = 100;
    output[3 * numAnchors + anchorIdx] = 80;
    // Class score = 0.95
    output[(4 + classIdx) * numAnchors + anchorIdx] = 0.95;

    const detections = postprocessOutput(output, { padX: 0, padY: 0, scale: 1 });

    expect(detections.length).toBe(1);
    expect(detections[0].label).toBe("cup");
    expect(detections[0].confidence).toBeCloseTo(0.95);
    // top-left x = cx - w/2 = 320 - 50 = 270
    expect(detections[0].x).toBeCloseTo(270);
    // top-left y = cy - h/2 = 320 - 40 = 280
    expect(detections[0].y).toBeCloseTo(280);
    expect(detections[0].w).toBeCloseTo(100);
    expect(detections[0].h).toBeCloseTo(80);
  });

  it("filters out detections below confidence threshold", () => {
    const numAnchors = 8400;
    const output = new Float32Array(84 * numAnchors).fill(0);

    // Set a low-confidence detection (below 0.85)
    const anchorIdx = 10;
    output[0 * numAnchors + anchorIdx] = 200;
    output[1 * numAnchors + anchorIdx] = 200;
    output[2 * numAnchors + anchorIdx] = 50;
    output[3 * numAnchors + anchorIdx] = 50;
    output[(4 + 0) * numAnchors + anchorIdx] = 0.2; // confidence below threshold

    const detections = postprocessOutput(output, { padX: 0, padY: 0, scale: 1 });
    expect(detections.length).toBe(0);
  });

  it("applies NMS to remove overlapping boxes of same class", () => {
    const numAnchors = 8400;
    const output = new Float32Array(84 * numAnchors).fill(0);

    // Two highly overlapping cup detections
    for (const [anchorIdx, cx, score] of [[0, 320, 0.95], [1, 322, 0.90]] as const) {
      output[0 * numAnchors + anchorIdx] = cx;
      output[1 * numAnchors + anchorIdx] = 320;
      output[2 * numAnchors + anchorIdx] = 100;
      output[3 * numAnchors + anchorIdx] = 100;
      output[(4 + 41) * numAnchors + anchorIdx] = score;
    }

    const detections = postprocessOutput(output, { padX: 0, padY: 0, scale: 1 });
    // Should only keep one (highest confidence wins)
    expect(detections.length).toBe(1);
    expect(detections[0].confidence).toBeCloseTo(0.95);
  });

  it("COCO_CLASSES has 80 entries", () => {
    expect(COCO_CLASSES.length).toBe(80);
  });
});

describe("smoothBox", () => {
  it("applies EMA with default factor", () => {
    const prev = { x: 100, y: 100, w: 50, h: 50 };
    const curr = { x: 200, y: 200, w: 100, h: 100 };
    const result = smoothBox(prev, curr);

    const f = SMOOTHING_FACTOR; // 0.7
    expect(result.x).toBeCloseTo(100 * f + 200 * (1 - f));
    expect(result.y).toBeCloseTo(100 * f + 200 * (1 - f));
    expect(result.w).toBeCloseTo(50 * f + 100 * (1 - f));
    expect(result.h).toBeCloseTo(50 * f + 100 * (1 - f));
  });

  it("with factor=0, returns curr exactly", () => {
    const prev = { x: 100, y: 100, w: 50, h: 50 };
    const curr = { x: 200, y: 200, w: 100, h: 100 };
    const result = smoothBox(prev, curr, 0);
    expect(result.x).toBe(200);
    expect(result.y).toBe(200);
    expect(result.w).toBe(100);
    expect(result.h).toBe(100);
  });

  it("with factor=1, returns prev exactly", () => {
    const prev = { x: 100, y: 100, w: 50, h: 50 };
    const curr = { x: 200, y: 200, w: 100, h: 100 };
    const result = smoothBox(prev, curr, 1);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.w).toBe(50);
    expect(result.h).toBe(50);
  });
});
