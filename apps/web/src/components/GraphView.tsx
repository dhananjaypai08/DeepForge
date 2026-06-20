import { ArrowRight } from "lucide-react";
import type { StrategyGraph } from "@deepforge/compiler";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS: Record<string, string> = {
  capital: "var(--chart-2)",
  allocator: "var(--chart-5)",
  binary: "var(--chart-3)",
  range: "var(--chart-1)",
  plp: "var(--chart-2)",
  hedge: "var(--chart-4)",
  settlement: "var(--muted-foreground)",
  autoroll: "var(--chart-5)",
  exit: "var(--muted-foreground)",
};

export function GraphView({ graph }: { graph: StrategyGraph }) {
  const legNodes = graph.nodes.filter((n) =>
    ["binary", "range", "plp", "hedge"].includes(n.kind),
  );
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;
  const hasRoll = graph.nodes.some((n) => n.kind === "autoroll");

  const Chip = ({ id }: { id: string }) => {
    const n = node(id);
    return (
      <div
        className="rounded-md border border-border border-l-2 bg-secondary/40 px-3 py-2 min-w-[112px]"
        style={{ borderLeftColor: COLORS[n.kind] }}
      >
        <div className="text-[10px] uppercase tracking-wide" style={{ color: COLORS[n.kind] }}>
          {n.kind}
        </div>
        <div className="text-xs text-foreground">{n.label}</div>
      </div>
    );
  };
  const Arrow = () => <ArrowRight className="size-4 shrink-0 text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Strategy graph</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Chip id="capital" />
        <Arrow />
        <Chip id="allocator" />
        <Arrow />
        <div className="flex flex-col gap-2">
          {legNodes.map((n) => (
            <Chip key={n.id} id={n.id} />
          ))}
        </div>
        <Arrow />
        <Chip id="settlement" />
        {hasRoll && (
          <>
            <Arrow />
            <Chip id="autoroll" />
          </>
        )}
        <Arrow />
        <Chip id="exit" />
      </CardContent>
    </Card>
  );
}
