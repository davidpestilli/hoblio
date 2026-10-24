export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentGuide {
  id: string;
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
}

export interface SnapResult {
  position: { x: number; y: number };
  guides: AlignmentGuide[];
}

const TOLERANCE = 12;
const GUIDE_MARGIN = 24;

interface AxisMatch {
  delta: number;
  guide: AlignmentGuide;
}

function centerMatch(axis: "x" | "y", dragged: Rect, other: Rect, otherId: string): AxisMatch | null {
  const draggedCenter = axis === "x" ? dragged.x + dragged.width / 2 : dragged.y + dragged.height / 2;
  const otherCenter = axis === "x" ? other.x + other.width / 2 : other.y + other.height / 2;
  const delta = otherCenter - draggedCenter;
  if (Math.abs(delta) > TOLERANCE) {
    return null;
  }
  const draggedStart = axis === "x" ? dragged.y : dragged.x;
  const draggedEnd = axis === "x" ? dragged.y + dragged.height : dragged.x + dragged.width;
  const otherStart = axis === "x" ? other.y : other.x;
  const otherEnd = axis === "x" ? other.y + other.height : other.x + other.width;
  return {
    delta,
    guide: {
      id: `${otherId}-center-${axis}`,
      axis,
      position: otherCenter,
      start: Math.min(draggedStart, otherStart) - GUIDE_MARGIN,
      end: Math.max(draggedEnd, otherEnd) + GUIDE_MARGIN,
    },
  };
}

function edgeMatch(axis: "x" | "y", dragged: Rect, other: Rect, otherId: string): AxisMatch | null {
  const draggedStart = axis === "x" ? dragged.x : dragged.y;
  const draggedEnd = axis === "x" ? dragged.x + dragged.width : dragged.y + dragged.height;
  const otherStart = axis === "x" ? other.x : other.y;
  const otherEnd = axis === "x" ? other.x + other.width : other.y + other.height;
  const perpendicularStart = axis === "x" ? Math.min(dragged.y, other.y) : Math.min(dragged.x, other.x);
  const perpendicularEnd = axis === "x"
    ? Math.max(dragged.y + dragged.height, other.y + other.height)
    : Math.max(dragged.x + dragged.width, other.x + other.width);

  const options: { delta: number; position: number; id: string }[] = [
    { delta: otherStart - draggedStart, position: otherStart, id: `${otherId}-start-${axis}` },
    { delta: otherEnd - draggedEnd, position: otherEnd, id: `${otherId}-end-${axis}` },
  ];
  const best = options
    .filter((option) => Math.abs(option.delta) <= TOLERANCE)
    .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0];
  if (!best) {
    return null;
  }
  return {
    delta: best.delta,
    guide: {
      id: best.id,
      axis,
      position: best.position,
      start: perpendicularStart - GUIDE_MARGIN,
      end: perpendicularEnd + GUIDE_MARGIN,
    },
  };
}

export function computeSnap(dragged: Rect, others: { id: string; rect: Rect }[]): SnapResult {
  const matches: Partial<Record<"x" | "y", AxisMatch>> = {};

  for (const axis of ["y", "x"] as const) {
    let bestCenter: AxisMatch | null = null;
    for (const other of others) {
      const candidate = centerMatch(axis, dragged, other.rect, other.id);
      if (candidate && (!bestCenter || Math.abs(candidate.delta) < Math.abs(bestCenter.delta))) {
        bestCenter = candidate;
      }
    }
    if (bestCenter) {
      matches[axis] = bestCenter;
      continue;
    }
    let bestEdge: AxisMatch | null = null;
    for (const other of others) {
      const candidate = edgeMatch(axis, dragged, other.rect, other.id);
      if (candidate && (!bestEdge || Math.abs(candidate.delta) < Math.abs(bestEdge.delta))) {
        bestEdge = candidate;
      }
    }
    if (bestEdge) {
      matches[axis] = bestEdge;
    }
  }

  const guides: AlignmentGuide[] = [];
  const position = { x: dragged.x, y: dragged.y };

  if (matches.y) {
    position.y += matches.y.delta;
    guides.push({ ...matches.y.guide, position: matches.y.guide.position });
  }
  if (matches.x) {
    position.x += matches.x.delta;
    guides.push({ ...matches.x.guide });
  }

  return { position, guides };
}

export function guidesEqual(left: AlignmentGuide[], right: AlignmentGuide[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((guide, index) => {
    const other = right[index];
    return (
      guide.id === other.id &&
      guide.axis === other.axis &&
      Math.abs(guide.position - other.position) < 0.5 &&
      Math.abs(guide.start - other.start) < 0.5 &&
      Math.abs(guide.end - other.end) < 0.5
    );
  });
}
