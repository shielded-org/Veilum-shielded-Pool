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
    <div className="landing">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
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
          <div id="landing-mobile-menu" className={`landing-menu${menuOpen ? " landing-menu--open" : ""}`}>
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
          {menuOpen && (
            <button
              type="button"
              className="landing-menu-backdrop"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
          )}
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
                Private stablecoin payments on Stellar — shield, send, and withdraw with clear privacy
                boundaries.
              </p>
            </div>
            <div className="landing-footer__col">
              <h3>Product</h3>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/how-to-use">How to use</Link>
              <Link to="/about">About the protocol</Link>
            </div>
            <div className="landing-footer__col">
              <h3>Privacy model</h3>
              <span>Deposits are public</span>
              <span>Transfers are private</span>
              <span>Withdrawals are public</span>
            </div>
          </div>
          <p className="landing-footer__legal">
            Testnet software — not financial advice. Shield keys are derived locally and never leave your
            browser.
          </p>
        </footer>
      </div>
    </div>
  );
}
