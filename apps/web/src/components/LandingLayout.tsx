import { Link, NavLink, Outlet } from "react-router-dom";

export function LandingLayout() {
  return (
    <div className="landing">
      <div className="container">
        <nav className="landing-nav">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="landing-logo">S</div>
            <strong>Stellar Shielded</strong>
          </div>
          <div className="landing-menu">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Home
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => (isActive ? "active" : "")}>
              About Us
            </NavLink>
            <NavLink to="/how-to-use" className={({ isActive }) => (isActive ? "active" : "")}>
              How to Use
            </NavLink>
            <Link to="/dashboard" className="btn btn-primary">
              Open Dashboard
            </Link>
          </div>
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
