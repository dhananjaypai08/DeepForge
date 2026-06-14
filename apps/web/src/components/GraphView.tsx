import type { StrategyGraph } from "@deepforge/compiler";

const COLORS: Record<string, string> = {
  capital: "#2dd4bf",
  allocator: "#a78bfa",
  binary: "#f59e0b",
  range: "#38bdf8",
  plp: "#34d399",
  hedge: "#fb7185",
  settlement: "#94a3b8",
  autoroll: "#c084fc",
  exit: "#64748b",
};

/** Render the strategy DAG as a simple layered flow (capital → legs → exit). */
export function GraphView({ graph }: { graph: StrategyGraph }) {
  const legNodes = graph.nodes.filter((n) =>
    ["binary", "range", "plp", "hedge"].includes(n.kind),
  );
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;
  const chip = (id: string) => {
    const n = node(id);
    return (
      <div key={id} className="node" style={{ borderColor: COLORS[n.kind] }}>
        <div className="node-kind" style={{ color: COLORS[n.kind] }}>
          {n.kind}
        </div>
        <div className="node-label">{n.label}</div>
      </div>
    );
  };
  return (
    <div className="graph">
      <div className="graph-col">{chip("capital")}</div>
      <div className="graph-arrow">→</div>
      <div className="graph-col">{chip("allocator")}</div>
      <div className="graph-arrow">→</div>
      <div className="graph-col legs">{legNodes.map((n) => chip(n.id))}</div>
      <div className="graph-arrow">→</div>
      <div className="graph-col">{chip("settlement")}</div>
      {graph.nodes.some((n) => n.kind === "autoroll") && (
        <>
          <div className="graph-arrow">→</div>
          <div className="graph-col">{chip("autoroll")}</div>
        </>
      )}
      <div className="graph-arrow">→</div>
      <div className="graph-col">{chip("exit")}</div>
    </div>
  );
}
