import { Link, NavLink, Outlet } from "react-router-dom";

import { useShieldedSync } from "./ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { shortenAddress } from "../lib/utils";

export function DashboardLayout() {
  useShieldedSync();
  const { address: wallet } = useWallet();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="profile">
          <div className="avatar">◎</div>
          <strong>{wallet ? shortenAddress(wallet, 6) : "Not connected"}</strong>
          <div className="muted" style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            Shielded wallet
          </div>
        </div>
        <nav className="dashboard-nav">
          <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/dashboard/shield" className={({ isActive }) => (isActive ? "active" : "")}>
            Shield / Deposit
          </NavLink>
          <NavLink to="/dashboard/faucet" className={({ isActive }) => (isActive ? "active" : "")}>
            Faucet
          </NavLink>
          <NavLink to="/dashboard/transfer" className={({ isActive }) => (isActive ? "active" : "")}>
            Private Transfer
          </NavLink>
          <NavLink to="/dashboard/unshield" className={({ isActive }) => (isActive ? "active" : "")}>
            Withdraw / Unshield
          </NavLink>
          <NavLink to="/dashboard/notes" className={({ isActive }) => (isActive ? "active" : "")}>
            Notes
          </NavLink>
          <NavLink to="/dashboard/keys" className={({ isActive }) => (isActive ? "active" : "")}>
            Viewing Keys
          </NavLink>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <Link to="/" style={{ color: "rgba(255,255,255,0.8)" }}>
            ← Back to site
          </Link>
        </div>
      </aside>
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}
