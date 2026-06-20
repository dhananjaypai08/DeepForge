#!/usr/bin/env bash
# Republish the deepforge::strategy package to the active Sui env and print the
# new package id. A new package id means a new StrategyPublished event type, so
# the marketplace starts empty (it only lists events under the configured id).
#
# After running: paste the new id into
#   packages/config/src/index.ts  ->  DEEPFORGE_STRATEGY_PACKAGE_TESTNET
# then rebuild/redeploy the web app.
set -euo pipefail

cd "$(dirname "$0")/../move/deepforge"
echo "Active Sui env: $(sui client active-env)"
echo "Publishing deepforge::strategy ..."

OUT=$(sui client publish --gas-budget 200000000 --json)
PKG=$(printf '%s' "$OUT" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=JSON.parse(s);
  const p=(r.objectChanges||[]).find(c=>c.type==='published');
  if(!p){console.error('publish failed');process.exit(1);}
  console.log(p.packageId);
});")

echo ""
echo "New deepforge package id: $PKG"
echo ""
echo "Next steps to reset the marketplace:"
echo "  1. Set DEEPFORGE_STRATEGY_PACKAGE_TESTNET in packages/config/src/index.ts to:"
echo "       $PKG"
echo "  2. Rebuild config + web:  pnpm --filter @deepforge/config build && pnpm --filter @deepforge/web build"
echo "  3. Redeploy the web app (or restart dev). The marketplace is now empty."
