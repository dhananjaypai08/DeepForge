import { useEffect, useState } from "react";
import {
  parseDeepforgeFile,
  serializeDeepforgeFile,
  type Allocation,
  type StrategyIR,
} from "@deepforge/ir";

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
    <div className="editor">
      <div className="tabs">
        {(["intent", "visual", "dsl"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "tab active" : "tab"} onClick={() => onModeChange(m)}>
            {m === "intent" ? "Intent" : m === "visual" ? "Visual" : "DSL"}
          </button>
        ))}
      </div>
      {mode === "intent" && <IntentMode onGenerate={onGenerate} generating={generating} />}
      {mode === "visual" && <VisualMode ir={ir} onChange={onChange} />}
      {mode === "dsl" && <DslMode ir={ir} onChange={onChange} />}
    </div>
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
    "BTC stays in a tight range for the next hour. I can risk $50, want max yield, cap loss at 20%.",
  );
  return (
    <div className="mode">
      <p className="muted">
        Describe your view in plain English. It reads the live market, compiles to the IR, then
        simulates — all in one click.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
      <button className="btn primary" disabled={generating} onClick={() => onGenerate(text)}>
        {generating ? "Working…" : "Generate strategy →"}
      </button>
    </div>
  );
}

function DslMode({ ir, onChange }: { ir: StrategyIR; onChange: (ir: StrategyIR) => void }) {
  const [text, setText] = useState(serializeDeepforgeFile(ir));
  const [err, setErr] = useState<string>();
  // Re-sync when the IR changes from another mode.
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
    <div className="mode">
      <p className="muted">The canonical *.deepforge.yaml — the artifact everything compiles from.</p>
      <textarea
        className="code"
        value={text}
        onChange={(e) => onEdit(e.target.value)}
        rows={18}
        spellCheck={false}
      />
      {err && <div className="error">{err}</div>}
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
  const addLeg = () =>
    set({ allocations: [...ir.allocations, { primitive: "plp", weightPct: 0 }] });
  const removeLeg = (i: number) =>
    set({ allocations: ir.allocations.filter((_, j) => j !== i) });

  return (
    <div className="mode">
      <div className="field-row">
        <label>
          Name
          <input value={ir.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Capital $
          <input
            type="number"
            value={ir.capital.amount}
            onChange={(e) => set({ capital: { ...ir.capital, amount: Number(e.target.value) } })}
          />
        </label>
        <label>
          Max loss %
          <input
            type="number"
            value={ir.risk.maxLossPct}
            onChange={(e) => set({ risk: { maxLossPct: Number(e.target.value) } })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!ir.autoRoll}
            onChange={(e) => set({ autoRoll: e.target.checked })}
          />
          auto-roll
        </label>
      </div>
      {ir.allocations.map((a, i) => (
        <LegCard key={i} alloc={a} onChange={(x) => setAlloc(i, x)} onRemove={() => removeLeg(i)} />
      ))}
      <button className="btn ghost" onClick={addLeg}>
        + add leg
      </button>
      <p className="muted">Weights must sum to 100% (validated at compile).</p>
    </div>
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
    else if (p === "range")
      onChange({ primitive: "range", weightPct: w, bounds: { widthBps: 50 } });
    else if (p === "hedge")
      onChange({ primitive: "hedge", weightPct: w, side: "down", strike: { atmOffsetBps: -300 } });
    else onChange({ primitive: p, weightPct: w, strike: { atmOffsetBps: 0 } });
  };
  return (
    <div className="leg-card">
      <select value={alloc.primitive} onChange={(e) => setPrimitive(e.target.value as Allocation["primitive"])}>
        <option value="binary_up">binary_up</option>
        <option value="binary_down">binary_down</option>
        <option value="range">range</option>
        <option value="plp">plp</option>
        <option value="hedge">hedge</option>
      </select>
      <label>
        weight %
        <input
          type="number"
          value={alloc.weightPct}
          onChange={(e) => onChange({ ...alloc, weightPct: Number(e.target.value) })}
        />
      </label>
      {alloc.primitive === "range" && (
        <label>
          width bps
          <input
            type="number"
            value={alloc.bounds.widthBps ?? 50}
            onChange={(e) =>
              onChange({ ...alloc, bounds: { widthBps: Number(e.target.value) } })
            }
          />
        </label>
      )}
      {(alloc.primitive === "binary_up" ||
        alloc.primitive === "binary_down" ||
        alloc.primitive === "hedge") && (
        <label>
          ATM offset bps
          <input
            type="number"
            value={alloc.strike.atmOffsetBps ?? 0}
            onChange={(e) =>
              onChange({ ...alloc, strike: { atmOffsetBps: Number(e.target.value) } })
            }
          />
        </label>
      )}
      <button className="btn ghost small" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
