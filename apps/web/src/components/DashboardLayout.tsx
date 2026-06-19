import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import { ConnectWallet, useShieldedSync } from "./ConnectWallet";
import { ConnectPrompt } from "./ui/ConnectPrompt";
import { NetworkBadge } from "./ui/NetworkBadge";
import { OnboardingResumeLink, OnboardingWizard } from "./ui/OnboardingWizard";
import { PageHeader } from "./ui/PageHeader";
import { ServiceStatusPill } from "./ui/ServiceStatusPill";
import {
  IconArrowRightCircle,
  IconHome,
  IconKey,
  IconList,
  IconLock,
  IconMenu,
  IconUploadCloud,
  IconVeilumMark,
  IconX,
} from "./ui/icons";
import { useWallet } from "../hooks/use-wallet";
import { WalletConnectionProvider, useWalletConnection } from "../hooks/use-wallet-connection";
import { isAspOperator } from "../lib/asp-admin";
import { DASHBOARD_PAGE_META, dashboardNavGroups } from "../lib/dashboard-routes";
import { useShieldedStore } from "../store/use-shielded-store";

export function DashboardLayout() {
  return (
    <WalletConnectionProvider>
      <DashboardLayoutInner />
    </WalletConnectionProvider>
  );
}

function DashboardLayoutInner() {
  useShieldedSync();
  const location = useLocation();
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const notes = useShieldedStore((s) => s.notes);
  const scanLoading = useShieldedStore((s) => s.scanLoading);
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const isTestnet = network === "testnet" || network === "futurenet" || network === "local";
  const showAspOperator = isTestnet && isAspOperator(wallet);
  const [navOpen, setNavOpen] = useState(false);

  const pageMeta = DASHBOARD_PAGE_META[location.pathname] ?? DASHBOARD_PAGE_META["/dashboard"];
  const navGroups = dashboardNavGroups(isTestnet);

  const pageMetaLine =
    location.pathname === "/dashboard/notes"
      ? scanLoading
        ? "Scanning…"
        : `${notes.length} total notes`
      : location.pathname === "/dashboard"
        ? `${network} · pool operations`
        : undefined;

  const description =
    location.pathname === "/dashboard/notes" && !scanLoading && notes.length > 0
      ? `${pageMeta.description} · ${notes.filter((n) => !n.spent).length} available`
      : pageMeta.description;

  const bottomNav = [
    { to: "/dashboard", end: true, label: "Home", icon: IconHome },
    { to: "/dashboard/shield", label: "Shield", icon: IconUploadCloud },
    { to: "/dashboard/transfer", label: "Send", icon: IconArrowRightCircle },
    { to: "/dashboard/notes", label: "Notes", icon: IconList },
    { to: "/dashboard/keys", label: "Keys", icon: IconKey },
  ] as const;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function closeNav() {
    setNavOpen(false);
  }

  const showConnectBanner = !wallet && location.pathname !== "/dashboard";

  return (
    <div className={`dashboard-shell${navOpen ? " dashboard-shell--nav-open" : ""}`}>
      <button
        type="button"
        className="dashboard-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={closeNav}
      />

      <aside id="dashboard-sidebar" className="dashboard-sidebar" aria-label="Dashboard navigation">
        <div className="dashboard-sidebar__top">
          <Link to="/dashboard" className="dashboard-sidebar__brand" onClick={closeNav}>
            <span className="dashboard-sidebar__brand-mark">
              <IconVeilumMark size={20} />
            </span>
            <span className="dashboard-sidebar__brand-text">Veilum</span>
          </Link>
          <button
            type="button"
            className="dashboard-sidebar__close"
            aria-label="Close navigation"
            onClick={closeNav}
          >
            <IconX size={20} />
          </button>
        </div>

        {navGroups.map((group) => (
          <div key={group.label} className="dashboard-nav-group">
            <span className="dashboard-nav-group__label">{group.label}</span>
            <nav className="dashboard-nav" aria-label={group.label}>
              {group.items.map(({ to, end, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={closeNav}
                >
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        ))}

        <div className="dashboard-sidebar__footer">
          <OnboardingResumeLink />
          {showAspOperator ? (
            <Link to="/dashboard/asp" className="dashboard-sidebar__operator" onClick={closeNav}>
              <IconLock size={18} />
              <span className="nav-label">ASP operator</span>
            </Link>
          ) : null}
          <Link to="/" onClick={closeNav}>
            <IconHome size={18} />
            <span className="nav-label">Back to site</span>
          </Link>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar__left">
            <button
              type="button"
              className="dashboard-menu-toggle"
              aria-expanded={navOpen}
              aria-controls="dashboard-sidebar"
              onClick={() => setNavOpen((open) => !open)}
            >
              {navOpen ? <IconX size={20} /> : <IconMenu size={20} />}
              <span className="sr-only">{navOpen ? "Close menu" : "Open menu"}</span>
            </button>
            <ol className="breadcrumb" aria-label="Breadcrumb">
              <li>
                <Link to="/">Veilum</Link>
              </li>
              <li>
                <span className="breadcrumb__current">{pageMeta.title}</span>
              </li>
            </ol>
          </div>
          <div className="dashboard-topbar__actions">
            <ServiceStatusPill online={relayerOk} />
            <NetworkBadge network={network} />
            <ConnectWallet />
          </div>
        </header>

        <div className="dashboard-page">
          <PageHeader title={pageMeta.title} description={description} meta={pageMetaLine} />
          {showConnectBanner ? <ConnectPrompt /> : null}
          <Outlet />
        </div>
      </div>

      <OnboardingWizard />

      <nav className="dashboard-bottom-nav" aria-label="Mobile navigation">
        {bottomNav.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
