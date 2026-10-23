import type { FlowNode, ActionKind } from "./model";
import { actionLabel, defaultAction, patchBrowserDomAction } from "./model";

type Props = {
  node: FlowNode | null;
  onChange: (node: FlowNode) => void;
};

export function PropertiesPanel({ node, onChange }: Props) {
  if (!node) {
    return <div className="panel properties">Select a node</div>;
  }

  const setLabel = (label: string) => onChange({ ...node, label });

  const setActionType = (type: ActionKind["type"]) => {
    if (node.kind !== "action") return;
    onChange({ ...node, action: defaultAction(type) });
  };

  const patchAction = (patch: Partial<ActionKind> & { type: ActionKind["type"] }) => {
    if (node.kind !== "action" || !node.action) return;
    onChange({ ...node, action: { ...node.action, ...patch } as ActionKind });
  };

  return (
    <div className="panel properties">
      <h3>Properties</h3>
      <label>
        Id
        <input value={node.id} readOnly />
      </label>
      <label>
        Kind
        <input value={node.kind} readOnly />
      </label>
      <label>
        Label
        <input
          value={node.label ?? ""}
          onChange={(e) => setLabel(e.target.value)}
          disabled={node.kind === "start"}
        />
      </label>

      {node.kind === "action" && node.action && (
        <>
          <label>
            Action type
            <select
              value={node.action.type}
              onChange={(e) => setActionType(e.target.value as ActionKind["type"])}
            >
              <option value="log">Log</option>
              <option value="no_op">NoOp</option>
              <option value="file_write">FileWrite</option>
              <option value="http_get">HttpGet</option>
              <option value="browser_navigate">BrowserNavigate</option>
              <option value="browser_click">BrowserClick</option>
              <option value="browser_fill">BrowserFill</option>
              <option value="browser_wait_for">BrowserWaitFor</option>
              <option value="browser_get_text">BrowserGetText</option>
              <option value="show_message">ShowMessage</option>
            </select>
          </label>
          <p className="hint">Current: {actionLabel(node.action)}</p>

          {node.action.type === "log" && (
            <label>
              Message
              <textarea
                rows={3}
                value={node.action.message}
                onChange={(e) => patchAction({ type: "log", message: e.target.value })}
              />
            </label>
          )}

          {node.action.type === "file_write" && (
            <>
              <label>
                Path
                <input
                  value={node.action.path}
                  onChange={(e) =>
                    patchAction({ type: "file_write", path: e.target.value, content: node.action!.type === "file_write" ? node.action.content : "" })
                  }
                />
              </label>
              <label>
                Content
                <textarea
                  rows={4}
                  value={node.action.content}
                  onChange={(e) =>
                    patchAction({ type: "file_write", content: e.target.value, path: node.action!.type === "file_write" ? node.action.path : "" })
                  }
                />
              </label>
            </>
          )}

          {node.action.type === "http_get" && (
            <label>
              URL
              <input
                value={node.action.url}
                onChange={(e) => patchAction({ type: "http_get", url: e.target.value })}
              />
            </label>
          )}

          {node.action.type === "show_message" && (
            <>
              <label>
                Title
                <input
                  value={node.action.title}
                  onChange={(e) =>
                    patchAction({
                      type: "show_message",
                      title: e.target.value,
                      text: node.action!.type === "show_message" ? node.action.text : "",
                      timeout_seconds:
                        node.action!.type === "show_message"
                          ? node.action.timeout_seconds
                          : undefined,
                    })
                  }
                />
              </label>
              <label>
                Text
                <textarea
                  rows={4}
                  value={node.action.text}
                  onChange={(e) =>
                    patchAction({
                      type: "show_message",
                      text: e.target.value,
                      title: node.action!.type === "show_message" ? node.action.title : "",
                      timeout_seconds:
                        node.action!.type === "show_message"
                          ? node.action.timeout_seconds
                          : undefined,
                    })
                  }
                />
              </label>
              <label>
                Timeout (seconds, empty = until Fechar)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={node.action.timeout_seconds ?? ""}
                  onChange={(e) =>
                    patchAction({
                      type: "show_message",
                      title: node.action!.type === "show_message" ? node.action.title : "",
                      text: node.action!.type === "show_message" ? node.action.text : "",
                      timeout_seconds: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </label>
            </>
          )}

          {node.action.type === "browser_navigate" && (
            <>
              <label>
                URL
                <input
                  value={node.action.url}
                  onChange={(e) =>
                    patchAction({
                      type: "browser_navigate",
                      url: e.target.value,
                      wait_ms: node.action!.type === "browser_navigate" ? node.action.wait_ms : undefined,
                    })
                  }
                />
              </label>
              <label>
                Wait (ms)
                <input
                  type="number"
                  value={node.action.wait_ms ?? ""}
                  onChange={(e) =>
                    patchAction({
                      type: "browser_navigate",
                      url: node.action!.type === "browser_navigate" ? node.action.url : "",
                      wait_ms: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </label>
            </>
          )}

          {(node.action.type === "browser_click" ||
            node.action.type === "browser_fill" ||
            node.action.type === "browser_wait_for" ||
            node.action.type === "browser_get_text") && (
            <>
              <label>
                CSS selector
                <input
                  value={node.action.selector}
                  onChange={(e) =>
                    onChange({
                      ...node,
                      action: patchBrowserDomAction(node.action!, { selector: e.target.value }, node.action!.type),
                    })
                  }
                />
              </label>
              <label>
                Timeout (ms)
                <input
                  type="number"
                  value={node.action.timeout_ms ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...node,
                      action: patchBrowserDomAction(
                        node.action!,
                        { timeout_ms: e.target.value ? Number(e.target.value) : undefined },
                        node.action!.type
                      ),
                    })
                  }
                />
              </label>
            </>
          )}

          {node.action.type === "browser_fill" && (
            <label>
              Text
              <textarea
                rows={3}
                value={node.action.text}
                onChange={(e) =>
                  onChange({
                    ...node,
                    action: patchBrowserDomAction(node.action!, { text: e.target.value }, "browser_fill"),
                  })
                }
              />
            </label>
          )}

          {node.action.type === "browser_get_text" && (
            <label>
              Variable name (optional, log-only for now)
              <input
                value={node.action.variable ?? ""}
                onChange={(e) =>
                  onChange({
                    ...node,
                    action: patchBrowserDomAction(
                      node.action!,
                      { variable: e.target.value || undefined },
                      "browser_get_text"
                    ),
                  })
                }
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
