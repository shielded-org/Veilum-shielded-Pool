import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { ConnectWallet, useShieldedSync } from "./ConnectWallet";
import { ConnectPrompt } from "./ui/ConnectPrompt";
import { NetworkBadge } from "./ui/NetworkBadge";
import { OnboardingResumeLink, OnboardingWizard } from "./ui/OnboardingWizard";
import { PageHeader } from "./ui/PageHeader";
import { IconArrowRightCircle, IconHome, IconKey, IconList, IconUploadCloud, IconVeilumMark } from "./ui/icons";
import { DASHBOARD_PAGE_META, dashboardNavGroups } from "../lib/dashboard-routes";
import { useShieldedStore } from "../store/use-shielded-store";

export function DashboardLayout() {
  useShieldedSync();
  const location = useLocation();
  const network = useShieldedStore((s) => s.network);
  const notes = useShieldedStore((s) => s.notes);
  const scanLoading = useShieldedStore((s) => s.scanLoading);
  const isTestnet = network === "testnet" || network === "futurenet" || network === "local";

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
      ? `${pageMeta.description} · ${notes.filter((n) => !n.spent).length} unspent`
      : pageMeta.description;

  const bottomNav = [
    { to: "/dashboard", end: true, label: "Home", icon: IconHome },
    { to: "/dashboard/shield", label: "Shield", icon: IconUploadCloud },
    { to: "/dashboard/transfer", label: "Send", icon: IconArrowRightCircle },
    { to: "/dashboard/notes", label: "Notes", icon: IconList },
    { to: "/dashboard/keys", label: "Keys", icon: IconKey },
  ] as const;

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
        <Link to="/dashboard" className="dashboard-sidebar__brand">
          <span className="dashboard-sidebar__brand-mark">
            <IconVeilumMark size={20} />
          </span>
          <span className="dashboard-sidebar__brand-text">Veilum</span>
        </Link>

        {navGroups.map((group) => (
          <div key={group.label} className="dashboard-nav-group">
            <span className="dashboard-nav-group__label">{group.label}</span>
            <nav className="dashboard-nav" aria-label={group.label}>
              {group.items.map(({ to, end, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        ))}

        <div className="dashboard-sidebar__footer">
          <OnboardingResumeLink />
          <Link to="/">
            <IconHome size={18} />
            <span className="nav-label">Back to site</span>
          </Link>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar__left">
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
            <NetworkBadge network={network} />
            <ConnectWallet />
          </div>
        </header>

        <div className="dashboard-page">
          <PageHeader title={pageMeta.title} description={description} meta={pageMetaLine} />
          <ConnectPrompt />
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
