import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import {
  parseDeepforgeFile,
  serializeDeepforgeFile,
  type Allocation,
  type StrategyIR,
} from "@deepforge/ir";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Mode = "intent" | "visual" | "dsl";

export function Editor({
  ir,
  onChange,
  mode,
  onModeChange,
  onGenerate,
  generating,
}: {
  ir: StrategyIR;
  onChange: (ir: StrategyIR) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onGenerate: (text: string) => void;
  generating: boolean;
}) {
  return (
    <Tabs value={mode} onValueChange={(v) => onModeChange(v as Mode)}>
      <TabsList>
        <TabsTrigger value="intent">Intent</TabsTrigger>
        <TabsTrigger value="visual">Visual</TabsTrigger>
        <TabsTrigger value="dsl">DSL</TabsTrigger>
      </TabsList>
      <TabsContent value="intent" className="mt-3">
        <IntentMode onGenerate={onGenerate} generating={generating} />
      </TabsContent>
      <TabsContent value="visual" className="mt-3">
        <VisualMode ir={ir} onChange={onChange} />
      </TabsContent>
      <TabsContent value="dsl" className="mt-3">
        <DslMode ir={ir} onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
}

function IntentMode({
  onGenerate,
  generating,
}: {
  onGenerate: (text: string) => void;
  generating: boolean;
}) {
  const [text, setText] = useState(
    "BTC stays in a tight range for the next hour. Keep it small - risk about $2, cap loss at 20%.",
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Describe your view in plain English - it reads the live market, compiles to the IR, then
        simulates. (Testnet has BTC markets only.)
      </p>
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <Button disabled={generating} onClick={() => onGenerate(text)}>
        {generating ? "Working…" : "Generate strategy"}
      </Button>
    </div>
  );
}

function DslMode({ ir, onChange }: { ir: StrategyIR; onChange: (ir: StrategyIR) => void }) {
  const [text, setText] = useState(serializeDeepforgeFile(ir));
  const [err, setErr] = useState<string>();
  useEffect(() => setText(serializeDeepforgeFile(ir)), [ir]);
  function onEdit(v: string) {
    setText(v);
    try {
      onChange(parseDeepforgeFile(v));
      setErr(undefined);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        The canonical <code>*.deepforge.yaml</code> - the artifact everything compiles from.
      </p>
      <Textarea
        className="font-mono text-xs"
        rows={18}
        spellCheck={false}
        value={text}
        onChange={(e) => onEdit(e.target.value)}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function VisualMode({ ir, onChange }: { ir: StrategyIR; onChange: (ir: StrategyIR) => void }) {
  const set = (patch: Partial<StrategyIR>) => onChange({ ...ir, ...patch });
  const setAlloc = (i: number, a: Allocation) => {
    const allocations = ir.allocations.slice();
    allocations[i] = a;
    set({ allocations });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Field label="Name">
          <Input value={ir.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Capital $">
          <Input
            type="number"
            className="w-24"
            value={ir.capital.amount}
            onChange={(e) => set({ capital: { ...ir.capital, amount: Number(e.target.value) } })}
          />
        </Field>
        <Field label="Max loss %">
          <Input
            type="number"
            className="w-24"
            value={ir.risk.maxLossPct}
            onChange={(e) => set({ risk: { maxLossPct: Number(e.target.value) } })}
          />
        </Field>
        <label className="flex items-end gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!ir.autoRoll}
            onChange={(e) => set({ autoRoll: e.target.checked })}
          />
          auto-roll
        </label>
      </div>
      {ir.allocations.map((a, i) => (
        <LegCard
          key={i}
          alloc={a}
          onChange={(x) => setAlloc(i, x)}
          onRemove={() => set({ allocations: ir.allocations.filter((_, j) => j !== i) })}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-1 self-start"
        onClick={() => set({ allocations: [...ir.allocations, { primitive: "plp", weightPct: 0 }] })}
      >
        <Plus className="size-3.5" /> add leg
      </Button>
      <p className="text-xs text-muted-foreground">Weights must sum to 100% (validated at compile).</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function LegCard({
  alloc,
  onChange,
  onRemove,
}: {
  alloc: Allocation;
  onChange: (a: Allocation) => void;
  onRemove: () => void;
}) {
  const setPrimitive = (p: Allocation["primitive"]) => {
    const w = alloc.weightPct;
    if (p === "plp") onChange({ primitive: "plp", weightPct: w });
    else if (p === "range") onChange({ primitive: "range", weightPct: w, bounds: { widthBps: 45 } });
    else if (p === "hedge")
      onChange({ primitive: "hedge", weightPct: w, side: "down", strike: { atmOffsetBps: -300 } });
    else onChange({ primitive: p, weightPct: w, strike: { atmOffsetBps: 0 } });
  };
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/30 p-3">
      <Field label="primitive">
        <Select value={alloc.primitive} onValueChange={(v) => setPrimitive(v as Allocation["primitive"])}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="binary_up">binary_up</SelectItem>
            <SelectItem value="binary_down">binary_down</SelectItem>
            <SelectItem value="range">range</SelectItem>
            <SelectItem value="plp">plp</SelectItem>
            <SelectItem value="hedge">hedge</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="weight %">
        <Input
          type="number"
          className="w-20"
          value={alloc.weightPct}
          onChange={(e) => onChange({ ...alloc, weightPct: Number(e.target.value) })}
        />
      </Field>
      {alloc.primitive === "range" && (
        <Field label="width bps">
          <Input
            type="number"
            className="w-24"
            value={alloc.bounds.widthBps ?? 45}
            onChange={(e) => onChange({ ...alloc, bounds: { widthBps: Number(e.target.value) } })}
          />
        </Field>
      )}
      {(alloc.primitive === "binary_up" ||
        alloc.primitive === "binary_down" ||
        alloc.primitive === "hedge") && (
        <Field label="ATM offset bps">
          <Input
            type="number"
            className="w-28"
            value={alloc.strike.atmOffsetBps ?? 0}
            onChange={(e) => onChange({ ...alloc, strike: { atmOffsetBps: Number(e.target.value) } })}
          />
        </Field>
      )}
      <Button variant="ghost" size="icon" className="ml-auto" onClick={onRemove}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
