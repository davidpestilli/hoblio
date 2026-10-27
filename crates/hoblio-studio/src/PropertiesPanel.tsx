import { useRef } from "react";

import { FlowVariablesOverview } from "./FlowVariablesOverview";
import {
  collectTakenVariableNames,
  scalarNamesForPicker,
  validateProducerName,
} from "./flowVariables";
import type {
  CompareOperator,
  ControlKind,
  ErrorHandling,
  FlowNode,
  ActionKind,
  OnFailure,
} from "./model";
import { actionLabel, defaultAction, patchBrowserDomAction, patchBrowserNavigate } from "./model";
import { ProjectVariablesPanel } from "./ProjectVariablesPanel";
import { listVariableNames } from "./projectVariables";
import { SubflowManagePanel } from "./SubflowManagePanel";

function LastRunValues({ lastRunVariables }: { lastRunVariables?: Record<string, string> }) {
  if (!lastRunVariables || Object.keys(lastRunVariables).length === 0) {
    return null;
  }
  return (
    <div className="last-run-vars">
      <h5>Last run values</h5>
      <ul className="flow-var-list">
        {Object.entries(lastRunVariables).map(([name, value]) => (
          <li key={name}>
            <span className="flow-var-name">{name}</span>
            <span className="flow-var-meta">{value || "(empty)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  node: FlowNode | null;
  flowNodes: FlowNode[];
  editing: boolean;
  variables: Record<string, unknown>;
  lastRunVariables?: Record<string, string>;
  onVariablesChange: (variables: Record<string, unknown>) => void;
  onSelectFlowNode?: (nodeId: string) => void;
  onRenameFlowVariable?: (oldName: string, newName: string) => void;
  onChange: (node: FlowNode, options?: { recordHistory?: boolean }) => void;
  onPropertyCommit: () => void;
  onDelete?: () => void;
  embeddedSubflowIds?: string[];
  onEditSubflow?: (subflowId: string) => void;
  subflowContext?: { id: string; ownerPath: string } | null;
  onRenameSubflow?: (subflowId: string, newId: string) => void;
  onDeleteSubflow?: (subflowId: string) => void;
  variablesTitle?: string;
  subflowOwnerPath?: string;
};

export function PropertiesPanel({
  node,
  flowNodes,
  editing,
  variables,
  lastRunVariables,
  onVariablesChange,
  onSelectFlowNode,
  onRenameFlowVariable,
  onChange,
  onPropertyCommit,
  onDelete,
  embeddedSubflowIds = [],
  onEditSubflow,
  subflowContext = null,
  onRenameSubflow,
  onDeleteSubflow,
  variablesTitle = "Project variables",
  subflowOwnerPath = "",
}: Props) {
  const readOnly = !editing;
  const outputNameBeforeEdit = useRef("");
  const scalarVars = scalarNamesForPicker(variables, flowNodes);
  const listVars = listVariableNames(variables);

  const draftChange = (node: FlowNode) => onChange(node, { recordHistory: false });
  const commitDraft = () => {
    if (!readOnly) {
      onPropertyCommit();
    }
  };

  if (!node) {
    return (
      <div className="panel properties">
        {subflowContext && onRenameSubflow && onDeleteSubflow ? (
          <SubflowManagePanel
            subflowId={subflowContext.id}
            ownerPath={subflowContext.ownerPath}
            readOnly={readOnly}
            existingSubflowIds={embeddedSubflowIds}
            onRename={(newId) => onRenameSubflow(subflowContext.id, newId)}
            onDelete={() => onDeleteSubflow(subflowContext.id)}
          />
        ) : null}
        {!subflowContext && embeddedSubflowIds.length > 0 && onRenameSubflow && onDeleteSubflow ? (
          <>
            <h3>Embedded subflows</h3>
            <ul className="subflow-manage-list">
              {embeddedSubflowIds.map((id) => (
                <li key={id}>
                  <SubflowManagePanel
                    compact
                    subflowId={id}
                    ownerPath={subflowOwnerPath}
                    readOnly={readOnly}
                    existingSubflowIds={embeddedSubflowIds}
                    onOpen={onEditSubflow ? () => onEditSubflow(id) : undefined}
                    onRename={(newId) => onRenameSubflow(id, newId)}
                    onDelete={() => onDeleteSubflow(id)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h3>{variablesTitle}</h3>
        {subflowContext ? (
          <p className="hint">Seeds and defaults for this subflow only (saved under subflows in JSON).</p>
        ) : (
          <p className="hint">Initial run variables for this flow file (entry orchestrator uses flow.json).</p>
        )}
        <FlowVariablesOverview nodes={flowNodes} onSelectNode={onSelectFlowNode} />
        <ProjectVariablesPanel
          variables={variables}
          disabled={readOnly}
          onChange={onVariablesChange}
        />
      </div>
    );
  }

  const setLabel = (label: string) => {
    if (readOnly) return;
    draftChange({ ...node, label });
  };

  const setActionType = (type: ActionKind["type"]) => {
    if (readOnly || node.kind !== "action") return;
    const taken = collectTakenVariableNames(flowNodes, variables);
    onChange({ ...node, action: defaultAction(type, { takenNames: taken }) });
  };

  const commitOutputVariableRename = (previous: string, next: string) => {
    if (readOnly || !onRenameFlowVariable) return;
    const oldName = previous.trim();
    const newName = next.trim();
    if (oldName && newName && oldName !== newName) {
      onRenameFlowVariable(oldName, newName);
    }
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

  const patchWhile = (patch: Partial<Extract<ControlKind, { type: "while" }>>) => {
    if (readOnly || node.control?.type !== "while") return;
    draftChange({ ...node, control: { ...node.control, ...patch, type: "while" } });
  };

  const patchRepeat = (patch: Partial<Extract<ControlKind, { type: "repeat" }>>) => {
    if (readOnly || node.control?.type !== "repeat") return;
    draftChange({ ...node, control: { ...node.control, ...patch, type: "repeat" } });
  };

  const patchErrorHandling = (patch: Partial<ErrorHandling>) => {
    if (readOnly || node.kind !== "action") return;
    const current = node.error_handling ?? {};
    draftChange({ ...node, error_handling: { ...current, ...patch } });
  };

  const compareOperatorOptions = (
    <>
      <option value="eq">Equal</option>
      <option value="ne">Not equal</option>
      <option value="contains">Contains</option>
      <option value="gt">&gt;</option>
      <option value="gte">&gt;=</option>
      <option value="lt">&lt;</option>
      <option value="lte">&lt;=</option>
    </>
  );

  return (
    <div className="panel properties">
      {subflowContext ? (
        <p className="hint subflow-context-banner">
          Subflow <strong>{subflowContext.id}</strong> — seeds live under{" "}
          <code>subflows.{subflowContext.id}.variables</code>.
        </p>
      ) : null}
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
          <datalist id="hoblio-scalar-vars">
            {scalarVars.map((name) => (
              <option key={name} value={`{${name}}`} />
            ))}
          </datalist>
          <label>
            Left
            <input
              value={node.control.left}
              disabled={readOnly}
              list="hoblio-scalar-vars"
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
              {compareOperatorOptions}
            </select>
          </label>
          <label>
            Right
            <input
              value={node.control.right}
              disabled={readOnly}
              list="hoblio-scalar-vars"
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
            Ignore case (text operators only)
          </label>
          <p className="hint">Connect saída then (→) e else (↓).</p>
        </>
      )}

      {node.kind === "while_loop" && node.control?.type === "while" && (
        <>
          <datalist id="hoblio-scalar-vars-while">
            {scalarVars.map((name) => (
              <option key={name} value={`{${name}}`} />
            ))}
          </datalist>
          <label>
            Left
            <input
              value={node.control.left}
              disabled={readOnly}
              list="hoblio-scalar-vars-while"
              onChange={(e) => patchWhile({ left: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <label>
            Operator
            <select
              value={node.control.operator}
              disabled={readOnly}
              onChange={(e) => {
                patchWhile({ operator: e.target.value as CompareOperator });
                commitDraft();
              }}
            >
              {compareOperatorOptions}
            </select>
          </label>
          <label>
            Right
            <input
              value={node.control.right}
              disabled={readOnly}
              list="hoblio-scalar-vars-while"
              onChange={(e) => patchWhile({ right: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <p className="hint">
            Re-evaluates each time the body returns. Body (→) must connect back to While; after (↓)
            when the condition is false.
          </p>
        </>
      )}

      {node.kind === "repeat" && node.control?.type === "repeat" && (
        <>
          <label>
            Times
            <input
              value={node.control.times}
              disabled={readOnly}
              onChange={(e) => patchRepeat({ times: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <label>
            Index variable (0-based)
            <input
              value={node.control.index_variable}
              disabled={readOnly}
              onChange={(e) => patchRepeat({ index_variable: e.target.value })}
              onBlur={commitDraft}
            />
          </label>
          <p className="hint">Body (→) returns to Repeat; after (↓) when all iterations finish.</p>
        </>
      )}

      {node.kind === "for_each" && node.control?.type === "for_each" && (
        <>
          <label>
            List variable
            {listVars.length > 0 ? (
              <select
                value={node.control.list_variable}
                disabled={readOnly}
                onChange={(e) => {
                  patchForEach({ list_variable: e.target.value });
                  commitDraft();
                }}
              >
                {listVars.includes(node.control.list_variable) ? null : (
                  <option value={node.control.list_variable}>
                    {node.control.list_variable} (not in project)
                  </option>
                )}
                {listVars.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={node.control.list_variable}
                disabled={readOnly}
                onChange={(e) => patchForEach({ list_variable: e.target.value })}
                onBlur={commitDraft}
              />
            )}
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
            {listVars.length === 0
              ? "Add a list under Project variables (click the canvas). "
              : null}
            Body (→) must return to For each; after (↓) runs when the loop finishes.
          </p>
        </>
      )}

      {(node.kind === "next_loop" || node.kind === "exit_loop") && (
        <p className="hint">
          Coloque dentro do corpo de For each, While ou Repeat; uma saída main.
        </p>
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
              <option value="file_append">FileAppend</option>
              <option value="file_read">FileRead</option>
              <option value="list_append">ListAppend</option>
              <option value="list_clear">ListClear</option>
              <option value="http_get">HttpGet</option>
              <option value="browser_navigate">BrowserNavigate</option>
              <option value="browser_click">BrowserClick</option>
              <option value="browser_wait_navigation">BrowserWaitNavigation</option>
              <option value="browser_fill">BrowserFill</option>
              <option value="browser_wait_for">BrowserWaitFor</option>
              <option value="delay">Delay</option>
              <option value="browser_get_text">BrowserGetText</option>
              <option value="set_variable">SetVariable</option>
              <option value="increase_variable">IncreaseVariable</option>
              <option value="decrease_variable">DecreaseVariable</option>
              <option value="show_message">ShowMessage</option>
              <option value="show_get_user_input">ShowGetUserInput</option>
              <option value="run_flow">RunFlow</option>
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
              {scalarVars.length > 0 ? (
                <span className="hint">
                  Use {"{name}"} — e.g. {scalarVars.slice(0, 3).map((n) => `{${n}}`).join(", ")}
                </span>
              ) : null}
            </label>
          )}

          {(node.action.type === "file_write" || node.action.type === "file_append") && (
            <>
              <label>
                Path (relative to project folder)
                <input
                  value={node.action.path}
                  onChange={(e) =>
                    patchActionDraft({
                      type: node.action!.type,
                      path: e.target.value,
                      content:
                        node.action!.type === "file_write" || node.action!.type === "file_append"
                          ? node.action!.content
                          : "",
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
                      type: node.action!.type,
                      content: e.target.value,
                      path:
                        node.action!.type === "file_write" || node.action!.type === "file_append"
                          ? node.action!.path
                          : "",
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              {node.action.type === "file_append" ? (
                <p className="hint">Appends without overwriting the existing file.</p>
              ) : null}
            </>
          )}

          {node.action.type === "file_read" && (
            <>
              <label>
                Path
                <input
                  value={node.action.path}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "file_read",
                      path: e.target.value,
                      variable:
                        node.action!.type === "file_read" ? node.action!.variable : "FileContent1",
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Output variable
                <input
                  value={node.action.variable}
                  onFocus={() => {
                    outputNameBeforeEdit.current =
                      node.action?.type === "file_read" ? node.action.variable : "";
                  }}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "file_read",
                      path: node.action!.type === "file_read" ? node.action!.path : "",
                      variable: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    commitOutputVariableRename(outputNameBeforeEdit.current, e.target.value.trim());
                    commitDraft();
                  }}
                  disabled={readOnly}
                />
              </label>
            </>
          )}

          {node.action.type === "list_clear" && (
            <label>
              List variable
              <input
                value={node.action.list_variable}
                disabled={readOnly}
                onChange={(e) =>
                  patchActionDraft({ type: "list_clear", list_variable: e.target.value })
                }
                onBlur={commitDraft}
              />
            </label>
          )}

          {node.action.type === "list_append" && (
            <>
              <label>
                List variable
                <input
                  value={node.action.list_variable}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "list_append",
                      list_variable: e.target.value,
                      item: node.action!.type === "list_append" ? node.action!.item : "",
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Item
                <input
                  value={node.action.item}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft({
                      type: "list_append",
                      list_variable:
                        node.action!.type === "list_append" ? node.action!.list_variable : "items",
                      item: e.target.value,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <p className="hint">Creates the list at `[]` on first append. For each can iterate it later in the same run.</p>
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
                {scalarVars.length > 0 ? (
                  <span className="hint">
                    Use {"{name}"} — e.g. {scalarVars.slice(0, 3).map((n) => `{${n}}`).join(", ")}
                  </span>
                ) : null}
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

          {node.action.type === "show_get_user_input" && (
            <>
              <label>
                Dialog title
                <input
                  value={node.action.title}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      title: e.target.value,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Message
                <textarea
                  rows={3}
                  value={node.action.message}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      message: e.target.value,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Default value
                <input
                  value={node.action.default_value ?? ""}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      default_value: e.target.value,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Input type
                <select
                  value={node.action.input_kind ?? "single_line"}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      input_kind: e.target.value as "single_line" | "multi_line",
                    })
                  }
                  onBlur={commitDraft}
                >
                  <option value="single_line">Single line</option>
                  <option value="multi_line">Multi line</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={node.action.topmost ?? false}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      topmost: e.target.checked,
                    })
                  }
                  onBlur={commitDraft}
                />
                Keep dialog always on top
              </label>
              <label>
                UserInput variable
                <input
                  value={node.action.user_input_variable}
                  onFocus={() => {
                    outputNameBeforeEdit.current =
                      node.action?.type === "show_get_user_input"
                        ? node.action.user_input_variable
                        : "";
                  }}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      user_input_variable: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    commitOutputVariableRename(outputNameBeforeEdit.current, e.target.value.trim());
                    commitDraft();
                  }}
                  disabled={readOnly}
                />
                {validateProducerName(node.action.user_input_variable) ? (
                  <span className="var-field-error">
                    {validateProducerName(node.action.user_input_variable)}
                  </span>
                ) : (
                  <span className="hint">Text entered by the user (PAD: UserInput).</span>
                )}
              </label>
              <label>
                ButtonPressed variable
                <input
                  value={node.action.button_pressed_variable}
                  onFocus={() => {
                    outputNameBeforeEdit.current =
                      node.action?.type === "show_get_user_input"
                        ? node.action.button_pressed_variable
                        : "";
                  }}
                  onChange={(e) =>
                    patchActionDraft({
                      ...node.action!,
                      type: "show_get_user_input",
                      button_pressed_variable: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    commitOutputVariableRename(outputNameBeforeEdit.current, e.target.value.trim());
                    commitDraft();
                  }}
                  disabled={readOnly}
                />
                {validateProducerName(node.action.button_pressed_variable) ? (
                  <span className="var-field-error">
                    {validateProducerName(node.action.button_pressed_variable)}
                  </span>
                ) : (
                  <span className="hint">OK or Cancel (PAD: ButtonPressed).</span>
                )}
              </label>
              <p className="hint">
                Blocks the flow until OK/Cancel (Windows). The dialog runs only during Run, not when
                you select this node.
              </p>
            </>
          )}

          {node.action.type === "browser_navigate" && (
            <>
              <label>
                URL
                <input
                  value={node.action.url}
                  onChange={(e) =>
                    patchActionDraft(
                      patchBrowserNavigate(node.action!, { url: e.target.value }),
                    )
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
                    patchActionDraft(
                      patchBrowserNavigate(node.action!, {
                        wait_ms: e.target.value ? Number(e.target.value) : undefined,
                      }),
                    )
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={node.action.show_on_screen ?? true}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft(
                      patchBrowserNavigate(node.action!, { show_on_screen: e.target.checked }),
                    )
                  }
                  onBlur={commitDraft}
                />
                Abrir o navegador na tela
              </label>
              {(node.action.show_on_screen ?? true) ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={node.action.start_maximized ?? true}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchActionDraft(
                        patchBrowserNavigate(node.action!, {
                          start_maximized: e.target.checked,
                        }),
                      )
                    }
                    onBlur={commitDraft}
                  />
                  Maximizar janela
                </label>
              ) : null}
              {(node.action.show_on_screen ?? true) && (node.action.start_maximized ?? true) ? (
                <p className="hint">
                  A janela ocupa a área útil do monitor (barra de tarefas permanece visível).
                </p>
              ) : null}
            </>
          )}

          {node.action.type === "browser_wait_navigation" && (
            <label>
              Timeout (ms)
              <input
                type="number"
                value={node.action.timeout_ms ?? ""}
                onChange={(e) =>
                  patchActionDraft({
                    type: "browser_wait_navigation",
                    timeout_ms: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                onBlur={commitDraft}
              />
            </label>
          )}

          {node.action.type === "delay" && (
            <label>
              Milliseconds
              <input
                type="number"
                min={0}
                value={node.action.milliseconds}
                disabled={readOnly}
                onChange={(e) =>
                  patchActionDraft({
                    type: "delay",
                    milliseconds: Number(e.target.value) || 0,
                  })
                }
                onBlur={commitDraft}
              />
            </label>
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
              {node.action.type === "browser_click" ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={node.action.wait_for_navigation ?? false}
                    disabled={readOnly}
                    onChange={(e) =>
                      draftChange({
                        ...node,
                        action: patchBrowserDomAction(
                          node.action!,
                          { wait_for_navigation: e.target.checked },
                          "browser_click",
                        ),
                      })
                    }
                    onBlur={commitDraft}
                  />
                  Wait for navigation after click
                </label>
              ) : null}
              {node.action.type === "browser_click" ? (
                <>
                  <label>
                    Wait selector after click (optional)
                    <input
                      value={node.action.wait_selector_after ?? ""}
                      disabled={readOnly}
                      placeholder="e.g. body h1"
                      onChange={(e) =>
                        draftChange({
                          ...node,
                          action: patchBrowserDomAction(
                            node.action!,
                            {
                              wait_selector_after: e.target.value || undefined,
                            },
                            "browser_click",
                          ),
                        })
                      }
                      onBlur={commitDraft}
                    />
                  </label>
                  <label>
                    Wait after timeout (ms)
                    <input
                      type="number"
                      value={node.action.wait_after_timeout_ms ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        draftChange({
                          ...node,
                          action: patchBrowserDomAction(
                            node.action!,
                            {
                              wait_after_timeout_ms: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            },
                            "browser_click",
                          ),
                        })
                      }
                      onBlur={commitDraft}
                    />
                  </label>
                </>
              ) : null}
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
              {scalarVars.length > 0 ? (
                <span className="hint">
                  Use {"{name}"} — e.g. {scalarVars.slice(0, 3).map((n) => `{${n}}`).join(", ")}
                </span>
              ) : null}
            </label>
          )}

          {node.action.type === "browser_get_text" && (
            <label>
              Output variable
              <input
                value={node.action.variable ?? ""}
                onFocus={() => {
                  outputNameBeforeEdit.current = node.action?.type === "browser_get_text"
                    ? (node.action.variable ?? "")
                    : "";
                }}
                onChange={(e) =>
                  draftChange({
                    ...node,
                    action: patchBrowserDomAction(
                      node.action!,
                      { variable: e.target.value || undefined },
                      "browser_get_text",
                    ),
                  })
                }
                onBlur={(e) => {
                  commitOutputVariableRename(outputNameBeforeEdit.current, e.target.value.trim());
                  commitDraft();
                }}
                disabled={readOnly}
              />
              {node.action.variable ? (
                validateProducerName(node.action.variable) ? (
                  <span className="var-field-error">
                    {validateProducerName(node.action.variable)}
                  </span>
                ) : (
                  <span className="hint">Stored at run time; use {"{name}"} in later actions.</span>
                )
              ) : (
                <span className="hint">Set a name to capture text from the page.</span>
              )}
            </label>
          )}

          {(node.action.type === "increase_variable" ||
            node.action.type === "decrease_variable") && (
            <>
              <label>
                Variable
                <input
                  value={node.action.variable}
                  disabled={readOnly}
                  onChange={(e) =>
                    patchActionDraft({
                      type: node.action!.type,
                      variable: e.target.value,
                      amount:
                        node.action!.type === "increase_variable" ||
                        node.action!.type === "decrease_variable"
                          ? node.action!.amount
                          : undefined,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Amount (optional, default 1)
                <input
                  value={node.action.amount ?? ""}
                  disabled={readOnly}
                  placeholder="1"
                  onChange={(e) =>
                    patchActionDraft({
                      type: node.action!.type,
                      variable:
                        node.action!.type === "increase_variable" ||
                        node.action!.type === "decrease_variable"
                          ? node.action!.variable
                          : "counter",
                      amount: e.target.value || undefined,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
            </>
          )}

          {node.action.type === "run_flow" && (
            <>
              <label>
                Flow id (manifest.flows)
                <input
                  value={node.action.flow_id ?? ""}
                  disabled={readOnly}
                  placeholder="login-eproc"
                  onChange={(e) =>
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: e.target.value || undefined,
                      path: node.action!.type === "run_flow" ? node.action.path : undefined,
                      inputs: node.action!.type === "run_flow" ? node.action.inputs : undefined,
                      outputs: node.action!.type === "run_flow" ? node.action.outputs : undefined,
                      share_browser:
                        node.action!.type === "run_flow" ? node.action.share_browser : true,
                    })
                  }
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Path (relative to project, if no flow id)
                <input
                  value={node.action.path ?? ""}
                  disabled={readOnly}
                  placeholder="flows/login.json"
                  onChange={(e) => {
                    const cur = node.action;
                    if (cur?.type !== "run_flow") return;
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: cur.flow_id,
                      path: e.target.value || undefined,
                      inputs: cur.inputs,
                      outputs: cur.outputs,
                      share_browser: cur.share_browser,
                    });
                  }}
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Variable scope
                <select
                  value={node.action.variable_scope ?? "inherit"}
                  disabled={readOnly}
                  onChange={(e) => {
                    const cur = node.action;
                    if (cur?.type !== "run_flow") return;
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: cur.flow_id,
                      path: cur.path,
                      inputs: cur.inputs,
                      outputs: cur.outputs,
                      share_browser: cur.share_browser,
                      variable_scope: e.target.value as "inherit" | "isolated",
                    });
                  }}
                  onBlur={commitDraft}
                >
                  <option value="inherit">Inherit (shared run variables)</option>
                  <option value="isolated">Isolated (outputs only)</option>
                </select>
              </label>
              <label>
                Share browser session
                <select
                  value={node.action.share_browser === false ? "false" : "true"}
                  disabled={readOnly}
                  onChange={(e) => {
                    const cur = node.action;
                    if (cur?.type !== "run_flow") return;
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: cur.flow_id,
                      path: cur.path,
                      inputs: cur.inputs,
                      outputs: cur.outputs,
                      variable_scope: cur.variable_scope,
                      share_browser: e.target.value === "true",
                    });
                  }}
                  onBlur={commitDraft}
                >
                  <option value="true">Yes (default)</option>
                  <option value="false">No (separate browser)</option>
                </select>
              </label>
              <label>
                Inputs (one per line: var=template)
                <textarea
                  rows={4}
                  disabled={readOnly}
                  value={Object.entries(node.action.inputs ?? {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join("\n")}
                  placeholder={"name={usuario}\nseed=static"}
                  onChange={(e) => {
                    const cur = node.action;
                    if (cur?.type !== "run_flow") return;
                    const inputs: Record<string, string> = {};
                    for (const line of e.target.value.split("\n")) {
                      const trimmed = line.trim();
                      if (!trimmed) continue;
                      const eq = trimmed.indexOf("=");
                      if (eq <= 0) continue;
                      const key = trimmed.slice(0, eq).trim();
                      const val = trimmed.slice(eq + 1).trim();
                      if (key) inputs[key] = val;
                    }
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: cur.flow_id,
                      path: cur.path,
                      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
                      outputs: cur.outputs,
                      share_browser: cur.share_browser,
                      variable_scope: cur.variable_scope,
                    });
                  }}
                  onBlur={commitDraft}
                />
              </label>
              <label>
                Outputs (comma-separated variable names for logs)
                <input
                  value={(node.action.outputs ?? []).join(", ")}
                  disabled={readOnly}
                  placeholder="sessao_ok, protocolo"
                  onChange={(e) => {
                    const cur = node.action;
                    if (cur?.type !== "run_flow") return;
                    const outputs = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    patchActionDraft({
                      type: "run_flow",
                      flow_id: cur.flow_id,
                      path: cur.path,
                      inputs: cur.inputs,
                      outputs: outputs.length > 0 ? outputs : undefined,
                      share_browser: cur.share_browser,
                    });
                  }}
                  onBlur={commitDraft}
                />
              </label>
              {embeddedSubflowIds.length > 0 ? (
                <label>
                  Embedded subflows (this file)
                  <ul className="flow-var-list">
                    {embeddedSubflowIds.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          className="link-button"
                          disabled={readOnly || !onEditSubflow}
                          onClick={() => onEditSubflow?.(id)}
                        >
                          Open ⎇ {id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </label>
              ) : null}
              {node.action.type === "run_flow" &&
              node.action.flow_id &&
              embeddedSubflowIds.includes(node.action.flow_id) ? (
                <button
                  type="button"
                  disabled={readOnly || !onEditSubflow}
                  onClick={() => {
                    const id = node.action?.type === "run_flow" ? node.action.flow_id : undefined;
                    if (id) onEditSubflow?.(id);
                  }}
                >
                  Edit subflow “{node.action.flow_id}”
                </button>
              ) : null}
              <p className="hint">
                Use flow id for manifest.flows or embedded subflows; path for external JSON files.
              </p>
            </>
          )}

          {node.action.type === "set_variable" && (
            <>
              <label>
                Output variable
                <input
                  value={node.action.variable}
                  onFocus={() => {
                    outputNameBeforeEdit.current =
                      node.action?.type === "set_variable" ? node.action.variable : "";
                  }}
                  onChange={(e) => {
                    if (node.action?.type !== "set_variable") return;
                    draftChange({
                      ...node,
                      action: { type: "set_variable", variable: e.target.value, value: node.action.value },
                    });
                  }}
                  onBlur={(e) => {
                    commitOutputVariableRename(outputNameBeforeEdit.current, e.target.value.trim());
                    commitDraft();
                  }}
                  disabled={readOnly}
                />
                {validateProducerName(node.action.variable) ? (
                  <span className="var-field-error">
                    {validateProducerName(node.action.variable)}
                  </span>
                ) : null}
              </label>
              <label>
                Value
                <textarea
                  rows={3}
                  value={node.action.value}
                  onChange={(e) => {
                    if (node.action?.type !== "set_variable") return;
                    draftChange({
                      ...node,
                      action: {
                        type: "set_variable",
                        variable: node.action.variable,
                        value: e.target.value,
                      },
                    });
                  }}
                  onBlur={commitDraft}
                  disabled={readOnly}
                />
                {scalarVars.length > 0 ? (
                  <span className="hint">
                    Supports {"{name}"} — e.g. {scalarVars.slice(0, 3).map((n) => `{${n}}`).join(", ")}
                  </span>
                ) : null}
              </label>
            </>
          )}

          <LastRunValues lastRunVariables={lastRunVariables} />

          <hr className="palette-divider" />
          <h4 className="palette-group">On error</h4>
          <label>
            Retry count (extra attempts)
            <input
              type="number"
              min={0}
              value={node.error_handling?.retry_count ?? 0}
              disabled={readOnly}
              onChange={(e) =>
                patchErrorHandling({ retry_count: Math.max(0, Number(e.target.value) || 0) })
              }
              onBlur={commitDraft}
            />
          </label>
          <label>
            Retry delay (ms)
            <input
              type="number"
              min={0}
              value={node.error_handling?.retry_delay_ms ?? 500}
              disabled={readOnly}
              onChange={(e) =>
                patchErrorHandling({ retry_delay_ms: Number(e.target.value) || 0 })
              }
              onBlur={commitDraft}
            />
          </label>
          <label>
            If still failing
            <select
              value={node.error_handling?.on_failure ?? "stop"}
              disabled={readOnly}
              onChange={(e) => {
                patchErrorHandling({ on_failure: e.target.value as OnFailure });
                commitDraft();
              }}
            >
              <option value="stop">Stop flow</option>
              <option value="continue">Continue to next step</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}
