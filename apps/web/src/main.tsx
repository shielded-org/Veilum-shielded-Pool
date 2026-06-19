import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import { Buffer } from "buffer";

import { App } from "./App";
import { WalletProvider } from "./components/WalletProvider";
import "./styles/global.css";
import "./styles/pages.css";
import "react-toastify/dist/ReactToastify.css";

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JotaiProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </JotaiProvider>
  </StrictMode>
);
