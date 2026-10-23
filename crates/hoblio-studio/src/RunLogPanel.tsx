import { useEffect, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { LogLine } from "./runLog";
import { fullLogText } from "./runLog";

type Props = {
  lines: LogLine[];
  showJson: boolean;
  onToggleJson: () => void;
};

export function RunLogPanel({ lines, showJson, onToggleJson }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, showJson]);

  const copyLogs = async () => {
    const text = fullLogText(lines, showJson);
    if (!text) return;
    await writeText(text);
  };

  return (
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
  );
}
