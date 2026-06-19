import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { IconMenu, IconVeilumMark, IconX } from "./ui/icons";

export function LandingLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`landing${menuOpen ? " landing--nav-open" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <button
        type="button"
        className="landing-menu-backdrop"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <div
        id="landing-mobile-menu"
        className={`landing-menu landing-menu--drawer${menuOpen ? " landing-menu--open" : ""}`}
      >
        <div className="landing-menu__head">
          <span className="landing-menu__title">Menu</span>
          <button
            type="button"
            className="landing-menu__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <IconX size={20} />
          </button>
        </div>
        <NavLink to="/" end onClick={() => setMenuOpen(false)}>
          Home
        </NavLink>
        <NavLink to="/about" onClick={() => setMenuOpen(false)}>
          About
        </NavLink>
        <NavLink to="/how-to-use" onClick={() => setMenuOpen(false)}>
          How to use
        </NavLink>
        <Link to="/dashboard" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
          Open Dashboard
        </Link>
      </div>

      <div className="container">
        <nav className={`landing-nav${scrolled ? " landing-nav--scrolled" : ""}`} aria-label="Main">
          <Link to="/" className="landing-brand">
            <span className="landing-brand__mark">
              <IconVeilumMark size={22} />
            </span>
            <span className="landing-brand__name">Veilum</span>
          </Link>
          <button
            type="button"
            className="landing-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
          <div className="landing-nav__links">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/how-to-use">How to use</NavLink>
            <Link to="/dashboard" className="btn btn-primary">
              Open Dashboard
            </Link>
          </div>
        </nav>
        <main id="main-content">
          <Outlet />
        </main>
        <footer className="landing-footer">
          <div className="landing-footer__grid">
            <div className="landing-footer__col">
              <div className="landing-footer__brand">
                <IconVeilumMark size={20} />
                <span>Veilum</span>
              </div>
              <p className="landing-footer__tagline">
                Private stablecoin payments on Stellar — add funds, pay privately, and withdraw on your terms.
              </p>
            </div>
            <div className="landing-footer__col">
              <h3>Product</h3>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/how-to-use">How to use</Link>
              <Link to="/about">About Veilum</Link>
            </div>
            <div className="landing-footer__col">
              <h3>What&apos;s private</h3>
              <span>Adding funds is public</span>
              <span>Payments between users are private</span>
              <span>Withdrawals are public</span>
            </div>
          </div>
          <p className="landing-footer__legal">
            Testnet preview — not financial advice. Your keys stay on your device and are never sent to us.
          </p>
        </footer>
      </div>
    </div>
  );
}
