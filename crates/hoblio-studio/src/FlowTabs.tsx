import type { ProjectFlowEntry } from "./projectFlows";

type Props = {
  tabs: ProjectFlowEntry[];
  activePath: string;
  dirtyPaths: Set<string>;
  onSelect: (relativePath: string) => void;
};

export function FlowTabs({ tabs, activePath, dirtyPaths, onSelect }: Props) {
  if (tabs.length <= 1) {
    return null;
  }
  return (
    <div className="flow-tabs" role="tablist" aria-label="Project flows">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const dirty = dirtyPaths.has(tab.path);
        const isSub = tab.kind === "subflow";
        const label = isSub
          ? `⎇ ${tab.id.replace(/^subflow:/, "")}`
          : tab.id === "entry"
            ? "Entry"
            : tab.id;
        return (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={active}
            className={`flow-tab${active ? " flow-tab-active" : ""}${isSub ? " flow-tab-subflow" : ""}`}
            title={tab.description ?? tab.path}
            onClick={() => onSelect(tab.path)}
          >
            {label}
            {dirty ? " *" : ""}
          </button>
        );
      })}
    </div>
  );
}
