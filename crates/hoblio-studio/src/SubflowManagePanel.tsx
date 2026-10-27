import { useEffect, useState } from "react";

import { isValidSubflowId } from "./subflowEditor";

type Props = {
  subflowId: string;
  ownerPath: string;
  readOnly: boolean;
  existingSubflowIds?: string[];
  onRename: (newId: string) => void;
  onDelete: () => void;
  onOpen?: () => void;
  compact?: boolean;
};

export function SubflowManagePanel({
  subflowId,
  ownerPath,
  readOnly,
  existingSubflowIds = [],
  onRename,
  onDelete,
  onOpen,
  compact = false,
}: Props) {
  const [renameDraft, setRenameDraft] = useState(subflowId);
  useEffect(() => {
    setRenameDraft(subflowId);
  }, [subflowId]);
  const duplicateId =
    renameDraft !== subflowId &&
    existingSubflowIds.some((id) => id === renameDraft);
  const renameError =
    renameDraft !== subflowId && renameDraft.length > 0 && !isValidSubflowId(renameDraft)
      ? "Invalid id (use letter/_ then alphanumeric/_)."
      : duplicateId
        ? `Subflow "${renameDraft}" already exists.`
        : null;

  return (
    <div className={`subflow-manage${compact ? " subflow-manage-compact" : ""}`}>
      {!compact ? (
        <>
          <h3>Embedded subflow</h3>
          <p className="hint">
            Defined in <code>{ownerPath}</code> → <code>subflows.{subflowId}</code>
          </p>
        </>
      ) : null}
      <div className="subflow-manage-row">
        {onOpen ? (
          <button type="button" disabled={readOnly} onClick={onOpen}>
            Open
          </button>
        ) : null}
        <label className="subflow-rename-field">
          Id
          <input
            value={renameDraft}
            disabled={readOnly}
            onChange={(e) => setRenameDraft(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={
            readOnly ||
            renameDraft === subflowId ||
            !isValidSubflowId(renameDraft) ||
            duplicateId
          }
          onClick={() => onRename(renameDraft)}
        >
          Rename
        </button>
        <button type="button" className="danger-button" disabled={readOnly} onClick={onDelete}>
          Delete
        </button>
      </div>
      {renameError ? <p className="var-field-error">{renameError}</p> : null}
    </div>
  );
}
