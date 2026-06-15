// Minimal backend that holds the OpenRouter key and exposes /api/intent.
// Keeps the LLM key server-side; the browser never sees it.
import { existsSync } from "node:fs";
import express from "express";

// Load env from the repo root .env (or local .env) if present.
for (const p of ["../../.env", ".env"]) {
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
      break;
    } catch {
      /* ignore */
    }
  }
}

const { intentToIR } = await import("@deepforge/intent");

const app = express();
app.use(express.json());

app.post("/api/intent", async (req, res) => {
  try {
    const { text, spotHint } = req.body ?? {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "missing text" });
    }
    const { ir } = await intentToIR(text, { spotHint });
    res.json({ ir });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 8787;
app.listen(port, () => console.log(`DeepForge intent server on :${port}`));
