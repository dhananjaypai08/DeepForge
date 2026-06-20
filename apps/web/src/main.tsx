import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { getFullnodeUrl } from "@mysten/sui/client";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";
import { App } from "./App.js";
import { Landing } from "@/components/Landing";
import "./index.css";

document.documentElement.classList.add("dark");

const networks = { testnet: { url: getFullnodeUrl("testnet") } };
const queryClient = new QueryClient();

function Root() {
  const [view, setView] = useState<"home" | "app">("home");
  return view === "home" ? (
    <Landing onLaunch={() => setView("app")} />
  ) : (
    <App onHome={() => setView("home")} />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Root />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
