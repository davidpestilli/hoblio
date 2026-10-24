import type { CompareOperator, ControlKind, FlowNode, ActionKind } from "./model";
import { actionLabel, defaultAction, patchBrowserDomAction } from "./model";

type Props = {
  node: FlowNode | null;
  editing: boolean;
  variablesJson: string;
  variablesError: string | null;
  onVariablesJsonChange: (value: string) => void;
  onChange: (node: FlowNode, options?: { recordHistory?: boolean }) => void;
  onPropertyCommit: () => void;
  onDelete?: () => void;
};

export function PropertiesPanel({
  node,
  editing,
  variablesJson,
  variablesError,
  onVariablesJsonChange,
  onChange,
  onPropertyCommit,
  onDelete,
}: Props) {
  const readOnly = !editing;

  const draftChange = (node: FlowNode) => onChange(node, { recordHistory: false });
  const commitDraft = () => {
    if (!readOnly) {
      onPropertyCommit();
    }
  };

  if (!node) {
    return (
      <div className="panel properties">
        <h3>Project variables</h3>
        <p className="hint">JSON object (ex. listas para For each).</p>
        <label>
          variables
          <textarea
            className="variables-editor"
            rows={12}
            value={variablesJson}
            disabled={readOnly}
            onChange={(e) => onVariablesJsonChange(e.target.value)}
          />
        </label>
        {variablesError ? <p className="variables-error">{variablesError}</p> : null}
      </div>
    );
  }

  const setLabel = (label: string) => {
    if (readOnly) return;
    draftChange({ ...node, label });
  };

  const setActionType = (type: ActionKind["type"]) => {
    if (readOnly || node.kind !== "action") return;
    onChange({ ...node, action: defaultAction(type) });
  };

  const patchAction = (
    patch: Partial<ActionKind> & { type: ActionKind["type"] },
    options?: { recordHistory?: boolean },
  ) => {
    if (readOnly || node.kind !== "action" || !node.action) return;
    onChange(
      { ...node, action: { ...node.action, ...patch } as ActionKind },
      options,
    );
  };

  const patchActionDraft = (patch: Partial<ActionKind> & { type: ActionKind["type"] }) =>
    patchAction(patch, { recordHistory: false });

  const patchIf = (patch: Partial<Extract<ControlKind, { type: "if" }>>) => {
    if (readOnly || node.control?.type !== "if") return;
    draftChange({ ...node, control: { ...node.control, ...patch, type: "if" } });
  };

  const patchForEach = (patch: Partial<Extract<ControlKind, { type: "for_each" }>>) => {
    if (readOnly || node.control?.type !== "for_each") return;
    draftChange({ ...node, control: { ...node.control, ...patch, type: "for_each" } });
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
          onBlur={commitDraft}
          disabled={readOnly || node.kind === "start"}
        />
      </label>

      {node.kind !== "start" && onDelete ? (
        <button type="button" className="props-delete" onClick={onDelete}>
          Delete node
        </button>
      ) : null}

      {node.kind === "if" && node.control?.type === "if" && (
        <>
          <label>
            Left
            <input
              value={node.control.left}
              disabled={readOnly}
              onChange={(e) => patchIf({ left: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <label>
            Operator
            <select
              value={node.control.operator}
              disabled={readOnly}
              onChange={(e) => {
                patchIf({ operator: e.target.value as CompareOperator });
                commitDraft();
              }}
            >
              <option value="eq">Equal</option>
              <option value="ne">Not equal</option>
              <option value="contains">Contains</option>
            </select>
          </label>
          <label>
            Right
            <input
              value={node.control.right}
              disabled={readOnly}
              onChange={(e) => patchIf({ right: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={node.control.ignore_case ?? false}
              disabled={readOnly}
              onChange={(e) => {
                patchIf({ ignore_case: e.target.checked });
                commitDraft();
              }}
            />
            Ignore case
          </label>
          <p className="hint">Connect saída then (→) e else (↓).</p>
        </>
      )}

      {node.kind === "for_each" && node.control?.type === "for_each" && (
        <>
          <label>
            List variable
            <input
              value={node.control.list_variable}
              disabled={readOnly}
              onChange={(e) => patchForEach({ list_variable: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <label>
            Item variable
            <input
              value={node.control.item_variable}
              disabled={readOnly}
              onChange={(e) => patchForEach({ item_variable: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <p className="hint">
            Lista JSON no projeto (ex. items). Corpo (→) deve voltar ao For each; after (↓) segue após o loop.
          </p>
        </>
      )}

      {(node.kind === "next_loop" || node.kind === "exit_loop") && (
        <p className="hint">Coloque dentro do corpo do For each; uma saída main.</p>
      )}

      {node.kind === "action" && node.action && (
        <>
          <label>
            Action type
            <select
              value={node.action.type}
              onChange={(e) => setActionType(e.target.value as ActionKind["type"])}
              disabled={readOnly}
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
                onChange={(e) => patchActionDraft({ type: "log", message: e.target.value })}
                onBlur={commitDraft}
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
                    patchActionDraft({
                      type: "file_write",
                      path: e.target.value,
                      content: node.action!.type === "file_write" ? node.action.content : "",
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Content
                <textarea
                  rows={4}
                  value={node.action.content}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "file_write",
                      content: e.target.value,
                      path: node.action!.type === "file_write" ? node.action.path : "",
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
            </>
          )}

          {node.action.type === "http_get" && (
            <label>
              URL
              <input
                value={node.action.url}
                onChange={(e) => patchActionDraft({ type: "http_get", url: e.target.value })}
                onBlur={commitDraft}
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
                    patchActionDraft({
                      type: "show_message",
                      title: e.target.value,
                      text: node.action!.type === "show_message" ? node.action.text : "",
                      timeout_seconds:
                        node.action!.type === "show_message"
                          ? node.action.timeout_seconds
                          : undefined,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Text
                <textarea
                  rows={4}
                  value={node.action.text}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "show_message",
                      text: e.target.value,
                      title: node.action!.type === "show_message" ? node.action.title : "",
                      timeout_seconds:
                        node.action!.type === "show_message"
                          ? node.action.timeout_seconds
                          : undefined,
                    })
                  }
                  onBlur={commitDraft}
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
                    patchActionDraft({
                      type: "show_message",
                      title: node.action!.type === "show_message" ? node.action.title : "",
                      text: node.action!.type === "show_message" ? node.action.text : "",
                      timeout_seconds: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  onBlur={commitDraft}
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
                    patchActionDraft({
                      type: "browser_navigate",
                      url: e.target.value,
                      wait_ms: node.action!.type === "browser_navigate" ? node.action.wait_ms : undefined,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Wait (ms)
                <input
                  type="number"
                  value={node.action.wait_ms ?? ""}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "browser_navigate",
                      url: node.action!.type === "browser_navigate" ? node.action.url : "",
                      wait_ms: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  onBlur={commitDraft}
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
                    draftChange({
                      ...node,
                      action: patchBrowserDomAction(node.action!, { selector: e.target.value }, node.action!.type),
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Timeout (ms)
                <input
                  type="number"
                  value={node.action.timeout_ms ?? ""}
                  onChange={(e) =>
                    draftChange({
                      ...node,
                      action: patchBrowserDomAction(
                        node.action!,
                        { timeout_ms: e.target.value ? Number(e.target.value) : undefined },
                        node.action!.type
                      ),
                    })
                  }
                  onBlur={commitDraft}
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
                  draftChange({
                    ...node,
                    action: patchBrowserDomAction(node.action!, { text: e.target.value }, "browser_fill"),
                  })
                }
                onBlur={commitDraft}
              />
            </label>
          )}

          {node.action.type === "browser_get_text" && (
            <label>
              Variable name (optional, log-only for now)
              <input
                value={node.action.variable ?? ""}
                onChange={(e) =>
                  draftChange({
                    ...node,
                    action: patchBrowserDomAction(
                      node.action!,
                      { variable: e.target.value || undefined },
                      "browser_get_text"
                    ),
                  })
                }
                onBlur={commitDraft}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
