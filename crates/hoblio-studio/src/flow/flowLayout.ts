import type { Waypoint } from "../model";

export function pathMidpoint(points: Waypoint[]): Waypoint {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  let best = { x: points[0].x, y: points[0].y };
  let bestDistance = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    }
  }
  return best;
}
