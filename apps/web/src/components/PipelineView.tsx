import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { PIPELINE_STAGES, type StageEvent } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PipelineView({ stages }: { stages: Record<string, StageEvent> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Compiler pipeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {PIPELINE_STAGES.map((s) => {
          const ev = stages[s.key];
          const status = ev?.status ?? "pending";
          return (
            <div
              key={s.key}
              className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0"
            >
              <span className="w-4 shrink-0">
                {status === "done" ? (
                  <Check className="size-4 text-success" />
                ) : status === "error" ? (
                  <X className="size-4 text-destructive" />
                ) : status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-warning" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground/50" />
                )}
              </span>
              <span
                className={`flex-1 text-[13px] ${status === "pending" ? "text-muted-foreground" : ""}`}
              >
                {s.label}
              </span>
              {ev?.detail && (
                <span
                  className={`font-mono text-[11px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {ev.detail}
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
