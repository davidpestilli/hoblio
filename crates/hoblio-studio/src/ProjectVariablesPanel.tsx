import { useMemo, useState } from "react";

import {
  buildVariables,
  isValidVariableName,
  partitionVariables,
  parseVariablesObject,
  uniqueVariableName,
  variablesToJson,
  type ListEntry,
  type ScalarEntry,
  type ScalarKind,
} from "./projectVariables";

type Props = {
  variables: Record<string, unknown>;
  disabled: boolean;
  onChange: (variables: Record<string, unknown>) => void;
};

export function ProjectVariablesPanel({ variables, disabled, onChange }: Props) {
  const { scalars, lists, otherKeys } = useMemo(
    () => partitionVariables(variables),
    [variables],
  );

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedText, setAdvancedText] = useState(() => variablesToJson(variables));
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const takenNames = useMemo(() => new Set(Object.keys(variables)), [variables]);

  const commitStructured = (nextScalars: ScalarEntry[], nextLists: ListEntry[]) => {
    onChange(buildVariables(nextScalars, nextLists, variables));
  };

  const handleAdvancedChange = (text: string) => {
    setAdvancedText(text);
    const parsed = parseVariablesObject(text);
    if (!parsed.ok) {
      setAdvancedError(parsed.error);
      return;
    }
    setAdvancedError(null);
    onChange(parsed.value);
  };

  const addScalar = () => {
    const name = uniqueVariableName("var", takenNames);
    commitStructured([...scalars, { name, kind: "text", value: "" }], lists);
  };

  const addList = () => {
    const name = uniqueVariableName("items", takenNames);
    commitStructured(scalars, [...lists, { name, items: [""] }]);
  };

  const updateScalar = (index: number, patch: Partial<ScalarEntry>) => {
    const next = scalars.map((row, i) => (i === index ? { ...row, ...patch } : row));
    commitStructured(next, lists);
  };

  const removeScalar = (index: number) => {
    commitStructured(
      scalars.filter((_, i) => i !== index),
      lists,
    );
  };

  const updateList = (index: number, patch: Partial<ListEntry>) => {
    const next = lists.map((row, i) => (i === index ? { ...row, ...patch } : row));
    commitStructured(scalars, next);
  };

  const removeList = (index: number) => {
    commitStructured(
      scalars,
      lists.filter((_, i) => i !== index),
    );
  };

  const updateListItem = (listIndex: number, itemIndex: number, value: string) => {
    const list = lists[listIndex];
    if (!list) return;
    const items = list.items.map((item, i) => (i === itemIndex ? value : item));
    updateList(listIndex, { items });
  };

  const addListItem = (listIndex: number) => {
    const list = lists[listIndex];
    if (!list) return;
    updateList(listIndex, { items: [...list.items, ""] });
  };

  const removeListItem = (listIndex: number, itemIndex: number) => {
    const list = lists[listIndex];
    if (!list) return;
    updateList(listIndex, {
      items: list.items.filter((_, i) => i !== itemIndex),
    });
  };

  return (
    <div className="project-variables">
      <p className="hint">Initial values for the run. Lists are used by For each.</p>

      <section className="var-section">
        <div className="var-section-head">
          <h4>Variables</h4>
          <button type="button" disabled={disabled} onClick={addScalar}>
            + Variable
          </button>
        </div>
        {scalars.length === 0 ? (
          <p className="var-empty">No variables yet.</p>
        ) : (
          <ul className="var-scalar-list">
            {scalars.map((row, index) => {
              const nameInvalid = row.name.length > 0 && !isValidVariableName(row.name);
              const duplicate =
                row.name.length > 0 &&
                scalars.filter((s) => s.name === row.name).length > 1;
              return (
                <li key={`scalar-${index}`} className="var-scalar-row">
                  <input
                    className="var-name"
                    placeholder="name"
                    value={row.name}
                    disabled={disabled}
                    onChange={(e) => updateScalar(index, { name: e.target.value })}
                    aria-invalid={nameInvalid || duplicate}
                  />
                  <select
                    value={row.kind}
                    disabled={disabled}
                    onChange={(e) => {
                      const kind = e.target.value as ScalarKind;
                      let value: string | number | boolean = row.value;
                      if (kind === "boolean") value = row.kind === "boolean" ? row.value : false;
                      else if (kind === "number")
                        value = row.kind === "number" ? row.value : 0;
                      else value = String(row.value);
                      updateScalar(index, { kind, value });
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  {row.kind === "boolean" ? (
                    <label className="checkbox-row var-bool-value">
                      <input
                        type="checkbox"
                        checked={row.value === true}
                        disabled={disabled}
                        onChange={(e) => updateScalar(index, { value: e.target.checked })}
                      />
                      true
                    </label>
                  ) : (
                    <input
                      className="var-value"
                      type={row.kind === "number" ? "number" : "text"}
                      value={String(row.value)}
                      disabled={disabled}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (row.kind === "number") {
                          updateScalar(index, { value: raw === "" ? 0 : Number(raw) });
                        } else {
                          updateScalar(index, { value: raw });
                        }
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="var-remove"
                    disabled={disabled}
                    title="Remove variable"
                    onClick={() => removeScalar(index)}
                  >
                    ×
                  </button>
                  {nameInvalid ? (
                    <span className="var-field-error">Invalid name (use letters, digits, _)</span>
                  ) : duplicate ? (
                    <span className="var-field-error">Duplicate name</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="var-section">
        <div className="var-section-head">
          <h4>Lists</h4>
          <button type="button" disabled={disabled} onClick={addList}>
            + List
          </button>
        </div>
        {lists.length === 0 ? (
          <p className="var-empty">No lists yet.</p>
        ) : (
          <ul className="var-list-blocks">
            {lists.map((list, listIndex) => {
              const nameInvalid = list.name.length > 0 && !isValidVariableName(list.name);
              const duplicate =
                list.name.length > 0 && lists.filter((l) => l.name === list.name).length > 1;
              return (
                <li key={`list-${listIndex}`} className="var-list-block">
                  <div className="var-list-head">
                    <input
                      className="var-name"
                      placeholder="list name"
                      value={list.name}
                      disabled={disabled}
                      onChange={(e) => updateList(listIndex, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="var-remove"
                      disabled={disabled}
                      title="Remove list"
                      onClick={() => removeList(listIndex)}
                    >
                      ×
                    </button>
                  </div>
                  {nameInvalid ? (
                    <span className="var-field-error">Invalid name (use letters, digits, _)</span>
                  ) : duplicate ? (
                    <span className="var-field-error">Duplicate name</span>
                  ) : null}
                  <ul className="var-list-items">
                    {list.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="var-list-item-row">
                        <input
                          value={item}
                          disabled={disabled}
                          placeholder={`item ${itemIndex + 1}`}
                          onChange={(e) => updateListItem(listIndex, itemIndex, e.target.value)}
                        />
                        <button
                          type="button"
                          className="var-remove"
                          disabled={disabled || list.items.length <= 1}
                          title="Remove item"
                          onClick={() => removeListItem(listIndex, itemIndex)}
                        >
                          −
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="var-add-item"
                    disabled={disabled}
                    onClick={() => addListItem(listIndex)}
                  >
                    + Item
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {otherKeys.length > 0 ? (
        <p className="hint var-other-hint">
          {otherKeys.length} nested value(s) ({otherKeys.join(", ")}) — edit in Advanced JSON only.
        </p>
      ) : null}

      <details
        className="var-advanced"
        open={advancedOpen}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setAdvancedOpen(open);
          if (open) {
            setAdvancedText(variablesToJson(variables));
            setAdvancedError(null);
          }
        }}
      >
        <summary>Advanced JSON</summary>
        <label>
          variables
          <textarea
            className="variables-editor"
            rows={10}
            value={advancedOpen ? advancedText : variablesToJson(variables)}
            disabled={disabled}
            onChange={(e) => handleAdvancedChange(e.target.value)}
          />
        </label>
        {advancedError ? <p className="variables-error">{advancedError}</p> : null}
      </details>
    </div>
  );
}
