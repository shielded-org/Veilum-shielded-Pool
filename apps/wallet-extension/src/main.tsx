import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import process from "process";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/extension.css";

const globalScope = globalThis as typeof globalThis & {
  Buffer: typeof Buffer;
  process: typeof process;
};

globalScope.Buffer = Buffer;
globalScope.process = process;

const rootEl = document.getElementById("root");

function renderFatal(message: string) {
  if (!rootEl) return;
  rootEl.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;max-width:380px"><h1 style="font-size:18px;margin:0 0 8px">Veilum failed to start</h1><p style="color:#b42318;font-size:13px;line-height:1.5">${message}</p></div>`;
}

if (!rootEl) {
  throw new Error("Missing #root");
}

try {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  renderFatal(error instanceof Error ? error.message : "Unknown startup error");
}
