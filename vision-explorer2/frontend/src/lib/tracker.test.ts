import { describe, it, expect, beforeEach } from "vitest";
import { SimpleTracker } from "./tracker";
import type { RawDetection } from "./tracker";

const box = (
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.9
): RawDetection => ({ label, confidence, x, y, w, h });

describe("SimpleTracker", () => {
  let tracker: SimpleTracker;

  beforeEach(() => {
    tracker = new SimpleTracker();
  });

  describe("track ID assignment", () => {
    it("assigns trackId 1 to the first detection", () => {
      const result = tracker.update([box("cup", 0, 0, 100, 100)]);
      expect(result[0].trackId).toBe(1);
    });

    it("same object across two frames inherits the same trackId", () => {
      const frame1 = tracker.update([box("cup", 10, 10, 100, 100)]);
      // Slightly moved box — high IoU with previous
      const frame2 = tracker.update([box("cup", 12, 12, 100, 100)]);
      expect(frame1[0].trackId).toBe(frame2[0].trackId);
    });

    it("new object gets a new trackId", () => {
      const frame1 = tracker.update([box("cup", 10, 10, 100, 100)]);
      // Different label and position — no match
      const frame2 = tracker.update([
        box("cup", 10, 10, 100, 100),
        box("bottle", 300, 300, 80, 80),
      ]);
      const ids = frame2.map((d) => d.trackId);
      expect(ids).toContain(frame1[0].trackId);
      expect(new Set(ids).size).toBe(2); // two distinct track IDs
    });

    it("object that disappears is not returned in the next frame", () => {
      tracker.update([box("cup", 10, 10, 100, 100)]);
      const frame2 = tracker.update([box("laptop", 300, 300, 200, 150)]);
      const labels = frame2.map((d) => d.label);
      expect(labels).not.toContain("cup");
    });

    it("objects that disappear do not reuse their old track ID", () => {
      const frame1 = tracker.update([box("cup", 10, 10, 100, 100)]);
      const disappearedId = frame1[0].trackId;
      // Cup disappears, new laptop appears
      tracker.update([]);
      const frame3 = tracker.update([box("laptop", 300, 300, 200, 150)]);
      expect(frame3[0].trackId).not.toBe(disappearedId);
    });

    it("does not match detections of different labels even with high spatial overlap", () => {
      const frame1 = tracker.update([box("cup", 10, 10, 100, 100)]);
      // Same box position but different label
      const frame2 = tracker.update([box("bottle", 10, 10, 100, 100)]);
      expect(frame2[0].trackId).not.toBe(frame1[0].trackId);
    });
  });

  describe("iou()", () => {
    it("returns 1.0 for identical boxes", () => {
      const result = tracker.iou(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 0, y: 0, w: 100, h: 100 }
      );
      expect(result).toBeCloseTo(1.0);
    });

    it("returns 0 for non-overlapping boxes", () => {
      const result = tracker.iou(
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 100, y: 100, w: 50, h: 50 }
      );
      expect(result).toBe(0);
    });

    it("returns correct value for partial overlap", () => {
      // a: [0,0] → [100,100], b: [50,50] → [150,150]
      // intersection: [50,50] → [100,100] = 50*50 = 2500
      // union: 100*100 + 100*100 - 2500 = 17500
      const result = tracker.iou(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 50, y: 50, w: 100, h: 100 }
      );
      expect(result).toBeCloseTo(2500 / 17500, 5);
    });

    it("returns 0 for touching but not overlapping boxes", () => {
      const result = tracker.iou(
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 50, y: 0, w: 50, h: 50 }
      );
      expect(result).toBe(0);
    });

    it("returns correct value when one box is fully inside another", () => {
      // inner: [25,25] → [75,75] = 50x50 = 2500
      // outer: [0,0] → [100,100] = 100x100 = 10000
      // intersection = 2500, union = 10000
      const result = tracker.iou(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 25, y: 25, w: 50, h: 50 }
      );
      expect(result).toBeCloseTo(2500 / 10000, 5);
    });
  });

  describe("multi-object tracking", () => {
    it("tracks multiple objects simultaneously with correct IDs", () => {
      const frame1 = tracker.update([
        box("cup", 0, 0, 100, 100),
        box("bottle", 200, 200, 80, 80),
      ]);
      const cupId = frame1.find((d) => d.label === "cup")!.trackId;
      const bottleId = frame1.find((d) => d.label === "bottle")!.trackId;

      const frame2 = tracker.update([
        box("cup", 5, 5, 100, 100),
        box("bottle", 205, 205, 80, 80),
      ]);
      expect(frame2.find((d) => d.label === "cup")!.trackId).toBe(cupId);
      expect(frame2.find((d) => d.label === "bottle")!.trackId).toBe(bottleId);
    });

    it("removes tracks not present in current frame", () => {
      tracker.update([
        box("cup", 0, 0, 100, 100),
        box("bottle", 200, 200, 80, 80),
      ]);
      const frame2 = tracker.update([box("cup", 5, 5, 100, 100)]);
      expect(frame2).toHaveLength(1);
      expect(frame2[0].label).toBe("cup");
      expect(tracker.activeTracks.size).toBe(1);
    });
  });
});
