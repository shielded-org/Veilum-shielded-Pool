import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import { Buffer } from "buffer";

import { App } from "./App";
import { ThemeProvider } from "./hooks/use-theme";
import { WalletProvider } from "./components/WalletProvider";
import "./styles/global.css";
import "./styles/pages.css";
import "./styles/impeccable-theme.css";
import "./styles/landing-tailwind.css";
import "./styles/wallet-kit.css";
import "./styles/onboarding-dialog.css";
import "./styles/theme-toggle.css";
import "./styles/dashboard-light.css";
import "./styles/mobile.css";
import "react-toastify/dist/ReactToastify.css";
import "./styles/toast.css";

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JotaiProvider>
      <ThemeProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </ThemeProvider>
    </JotaiProvider>
  </StrictMode>
);
