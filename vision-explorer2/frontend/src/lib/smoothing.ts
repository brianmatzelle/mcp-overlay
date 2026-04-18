import { SMOOTHING_FACTOR } from "./constants";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Exponential moving average for bounding box positions.
 * result = prev * factor + curr * (1 - factor)
 */
export function smoothBox(prev: Box, curr: Box, factor = SMOOTHING_FACTOR): Box {
  return {
    x: prev.x * factor + curr.x * (1 - factor),
    y: prev.y * factor + curr.y * (1 - factor),
    w: prev.w * factor + curr.w * (1 - factor),
    h: prev.h * factor + curr.h * (1 - factor),
  };
}
