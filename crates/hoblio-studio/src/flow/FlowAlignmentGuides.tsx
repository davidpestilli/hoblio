import { ViewportPortal } from "@xyflow/react";

import type { AlignmentGuide } from "./flowAlignment";

interface FlowAlignmentGuidesProps {
  guides: AlignmentGuide[];
}

export function FlowAlignmentGuides({ guides }: FlowAlignmentGuidesProps) {
  if (guides.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      {guides.map((guide) =>
        guide.axis === "y" ? (
          <div
            key={guide.id}
            className="flow-guide flow-guide-h"
            style={{
              left: guide.start,
              top: guide.position,
              width: Math.max(guide.end - guide.start, 0),
            }}
          />
        ) : (
          <div
            key={guide.id}
            className="flow-guide flow-guide-v"
            style={{
              left: guide.position,
              top: guide.start,
              height: Math.max(guide.end - guide.start, 0),
            }}
          />
        ),
      )}
    </ViewportPortal>
  );
}
