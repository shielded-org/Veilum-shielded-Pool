import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { DashboardLayout } from "./components/DashboardLayout";
import { LandingLayout } from "./components/LandingLayout";
import { AboutPage } from "./pages/AboutPage";
import { DashboardHome } from "./pages/DashboardHome";
import { FaucetPage } from "./pages/FaucetPage";
import { HowToUsePage } from "./pages/HowToUsePage";
import { KeysPage } from "./pages/KeysPage";
import { LandingPage } from "./pages/LandingPage";
import { NotesPage } from "./pages/NotesPage";
import { ShieldPage } from "./pages/ShieldPage";
import { TransferPage } from "./pages/TransferPage";
import { UnshieldPage } from "./pages/UnshieldPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="how-to-use" element={<HowToUsePage />} />
        </Route>
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="shield" element={<ShieldPage />} />
          <Route path="faucet" element={<FaucetPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="unshield" element={<UnshieldPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="keys" element={<KeysPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
