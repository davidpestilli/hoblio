import { collectFlowVariableProducers } from "./flowVariables";
import type { FlowNode } from "./model";

type Props = {
  nodes: FlowNode[];
  onSelectNode?: (nodeId: string) => void;
};

export function FlowVariablesOverview({ nodes, onSelectNode }: Props) {
  const producers = collectFlowVariableProducers(nodes);

  return (
    <section className="var-section flow-vars-section">
      <h4>Flow variables</h4>
      <p className="hint">
        Names assigned during the run by actions and loops (read-only index).
      </p>
      {producers.length === 0 ? (
        <p className="var-empty">No producers yet — use BrowserGetText or Set variable.</p>
      ) : (
        <ul className="flow-var-list">
          {producers.map((row) => (
            <li key={`${row.nodeId}-${row.name}-${row.source}`}>
              <span className="flow-var-name">{row.name}</span>
              <span className="flow-var-meta">
                {row.source} ·{" "}
                {onSelectNode ? (
                  <button type="button" className="flow-var-link" onClick={() => onSelectNode(row.nodeId)}>
                    {row.nodeLabel}
                  </button>
                ) : (
                  row.nodeLabel
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
