import { useCallback, useEffect, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { LogLine } from "./runLog";
import { fullLogText } from "./runLog";

type Props = {
  lines: LogLine[];
  showJson: boolean;
  onToggleJson: () => void;
  height: number;
  onHeightChange: (height: number) => void;
};

const MIN_LOG_HEIGHT = 72;
const MAX_LOG_HEIGHT = 480;

export function RunLogPanel({ lines, showJson, onToggleJson, height, onHeightChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, showJson]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = { startY: event.clientY, startHeight: height };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [height],
  );

  const onResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = drag.startY - event.clientY;
      const next = Math.min(MAX_LOG_HEIGHT, Math.max(MIN_LOG_HEIGHT, drag.startHeight + delta));
      onHeightChange(next);
    },
    [onHeightChange],
  );

  const onResizePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const copyLogs = async () => {
    const text = fullLogText(lines, showJson);
    if (!text) return;
    await writeText(text);
  };

  return (
    <div className="log-shell" style={{ height }}>
      <div
        className="log-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize run log"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      <footer className="log-panel">
        <div className="log-panel-header">
          <h3>Run log</h3>
          <div className="log-panel-actions">
            <label className="log-toggle">
              <input type="checkbox" checked={showJson} onChange={onToggleJson} />
              JSON
            </label>
            <button type="button" onClick={() => void copyLogs()} disabled={lines.length === 0}>
              Copy logs
            </button>
          </div>
        </div>
        <div className="log-scroll" ref={scrollRef}>
          {lines.length === 0 ? (
            <p className="log-empty">No events yet.</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="log-line">
                {showJson ? line.json : line.human}
              </div>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
