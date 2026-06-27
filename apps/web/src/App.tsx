import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import { DashboardLayout } from "./components/DashboardLayout";
import { LandingLayout } from "./components/LandingLayout";
import { useTheme } from "./hooks/use-theme";
import { WalletConnectionProvider } from "./hooks/use-wallet-connection";
import { AspAdminPage } from "./pages/AspAdminPage";
import { AboutPage } from "./pages/AboutPage";
import { DashboardHome } from "./pages/DashboardHome";
import { FaucetPage } from "./pages/FaucetPage";
import { KeysPage } from "./pages/KeysPage";
import { LandingPage } from "./pages/LandingPage";
import { NotesPage } from "./pages/NotesPage";
import { ShieldPage } from "./pages/ShieldPage";
import { TransferPage } from "./pages/TransferPage";
import { UnshieldPage } from "./pages/UnshieldPage";

function AppRoutes() {
  const { theme } = useTheme();

  return (
    <>
      <ToastContainer
        position="bottom-right"
        autoClose={8000}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        theme={theme}
        hideProgressBar={false}
        icon={false}
        toastClassName="veilum-toast"
        progressClassName="veilum-toast__progress"
        className="veilum-toast-container"
      />
      <Routes>
        <Route element={<LandingLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="how-to-use" element={<Navigate to="/about#getting-started" replace />} />
        </Route>
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="shield" element={<ShieldPage />} />
          <Route path="faucet" element={<FaucetPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="unshield" element={<UnshieldPage />} />
          <Route path="withdraw" element={<Navigate to="/dashboard/unshield" replace />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="asp" element={<AspAdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <WalletConnectionProvider>
        <AppRoutes />
      </WalletConnectionProvider>
    </BrowserRouter>
  );
}
