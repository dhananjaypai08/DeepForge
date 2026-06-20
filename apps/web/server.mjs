// DeepForge web server: serves the built SPA and the /api/intent proxy that
// holds the OpenRouter key (so the browser never sees it). One process in
// production; in dev it runs alongside Vite (which proxies /api here).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";

// Load env from a local/root .env if present (dev); on hosts use real env vars.
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

// Serve the production build (apps/web/dist) when present, with SPA fallback.
const dist = fileURLToPath(new URL("./dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = process.env.PORT ?? 8787;
app.listen(port, () => console.log(`DeepForge web server on :${port}`));
