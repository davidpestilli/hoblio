import { useEffect, useState } from "react";

import type { FlowEditorController } from "./useFlowEditor";
import { nodeTitle } from "./flowTypes";

interface FlowToolbarProps {
  controller: FlowEditorController;
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`flow-tool-btn ${active ? "active" : ""}`}
    >
      {label}
    </button>
  );
}

export function FlowToolbar({ controller }: FlowToolbarProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const selectedEdge = controller.selectedEdgeId
    ? controller.edges.find((edge) => edge.id === controller.selectedEdgeId) ?? null
    : null;
  const selectedLabel = typeof selectedEdge?.label === "string" ? selectedEdge.label : "";

  const titleOf = (nodeId: string) => {
    const node = controller.nodes.find((item) => item.id === nodeId)?.data.flowNode;
    return nodeTitle(node, nodeId);
  };

  useEffect(() => {
    const edge = controller.edges.find((item) => item.id === controller.selectedEdgeId);
    setCustomOpen(false);
    setLabelDraft(typeof edge?.label === "string" ? edge.label : "");
  }, [controller.edges, controller.selectedEdgeId]);

  const applyDraft = () => {
    if (controller.selectedEdgeId) {
      controller.setEdgeLabel(controller.selectedEdgeId, labelDraft);
    }
  };

  return (
    <div className="flow-toolbar">
      <div className="flow-toolbar-row">
        <div className="flow-toolbar-group" role="group" aria-label="Modo do diagrama">
          <button
            type="button"
            aria-pressed={!controller.editing}
            className={`flow-mode-btn ${!controller.editing ? "active" : ""}`}
            onClick={() => controller.setEditing(false)}
          >
            Exibição
          </button>
          <button
            type="button"
            aria-pressed={controller.editing}
            className={`flow-mode-btn ${controller.editing ? "active" : ""}`}
            onClick={() => controller.setEditing(true)}
          >
            Edição
          </button>
        </div>

        {controller.editing ? (
          <div className="flow-toolbar-actions">
            <ToolButton label="Desfazer" onClick={controller.undo} disabled={!controller.canUndo} />
            <ToolButton label="Refazer" onClick={controller.redo} disabled={!controller.canRedo} />
            <ToolButton
              label="Apagar seleção"
              onClick={controller.deleteSelection}
              title="Remove nós ou conexões selecionados (Delete / Backspace)"
            />
          </div>
        ) : null}
      </div>

      {selectedEdge ? (
        <div className="flow-edge-bar">
          <span className="flow-edge-bar-label">Conexão</span>
          <span className="flow-edge-bar-path">
            {titleOf(selectedEdge.source)} → {titleOf(selectedEdge.target)}
          </span>
          {controller.editing ? (
            <>
              <ToolButton
                label="Limpar texto"
                onClick={() => controller.setEdgeLabel(selectedEdge.id, "")}
              />
              <ToolButton
                label="Custom"
                active={customOpen}
                onClick={() => setCustomOpen(true)}
              />
              {customOpen ? (
                <input
                  autoFocus
                  className="flow-edge-label-input"
                  value={labelDraft}
                  placeholder="Texto da conexão"
                  onChange={(event) => setLabelDraft(event.target.value)}
                  onBlur={applyDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyDraft();
                      setCustomOpen(false);
                    }
                    if (event.key === "Escape") {
                      setCustomOpen(false);
                    }
                  }}
                />
              ) : (
                <span className="flow-edge-current-label">{selectedLabel || "(sem texto)"}</span>
              )}
            </>
          ) : (
            <span className="flow-edge-hint">Ative Edição para alterar esta conexão.</span>
          )}
          <ToolButton label="Fechar" onClick={() => controller.selectEdge(null)} />
        </div>
      ) : null}
    </div>
  );
}
