import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { LandingAuthCTA } from "./landing/LandingAuthCTA";
import { LandingAuthGate } from "./landing/LandingAuthGate";
import { IconMenu, IconVeilumMark, IconX } from "./ui/icons";
import { cn } from "../lib/cn";
import { ThemeToggle } from "./ui/ThemeToggle";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About" },
] as const;

export function LandingLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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
    <LandingAuthGate>
      <div className={cn("landing landing-page min-h-screen bg-veilum-bg text-veilum-text", menuOpen && "overflow-hidden")}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-veilum-accent focus:px-3 focus:py-2 focus:text-veilum-bg"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-50 px-4 pt-4 md:px-6">
          <nav
            className={cn(
              "mx-auto flex max-w-6xl items-center justify-between rounded-full border px-4 py-2.5 transition md:px-5",
              scrolled
                ? "lp-nav-scrolled border-veilum-border/80 bg-veilum-bg/80 backdrop-blur-xl"
                : "border-transparent bg-transparent"
            )}
            aria-label="Main"
          >
            <Link to="/" className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-veilum-accent/25 bg-veilum-accent/10 text-veilum-accent">
                <IconVeilumMark size={20} />
              </span>
              <span className="text-sm font-semibold tracking-tight">Veilum</span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {NAV.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "rounded-full px-4 py-2 text-sm transition",
                      isActive
                        ? "bg-veilum-accent/10 text-veilum-accent"
                        : "text-veilum-muted hover:bg-veilum-elevated/60 hover:text-veilum-text"
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
              <ThemeToggle />
              <LandingAuthCTA variant="nav" />
            </div>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-veilum-border bg-veilum-elevated/60 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <IconX size={18} /> : <IconMenu size={18} />}
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            </button>
          </nav>
        </header>

        <AnimatePresence>
          {menuOpen ? (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lp-mobile-overlay fixed inset-0 z-40 backdrop-blur-sm md:hidden"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <motion.div
                id="landing-mobile-menu"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="fixed right-0 top-0 z-50 flex h-full w-[min(100%,320px)] flex-col border-l border-veilum-border bg-veilum-bg p-6 md:hidden"
              >
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-sm font-medium text-veilum-muted">Menu</span>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-veilum-border"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  >
                    <IconX size={18} />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {NAV.map(({ to, label, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "rounded-xl px-4 py-3 text-base",
                          isActive ? "bg-veilum-accent/10 text-veilum-accent" : "text-veilum-text"
                        )
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                  <div className="mt-4 flex flex-col gap-3">
                    <ThemeToggle className="w-full" variant="labeled" />
                    <LandingAuthCTA variant="nav" onAction={() => setMenuOpen(false)} />
                  </div>
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>

        <main id="main-content">
          <Outlet />
        </main>

        <footer className="border-t border-veilum-border/60 bg-veilum-elevated/20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6 lg:px-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-veilum-accent/25 bg-veilum-accent/10 text-veilum-accent">
                  <IconVeilumMark size={16} />
                </span>
                <span className="font-semibold">Veilum</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-veilum-muted">
                Private stablecoin payments on Stellar — add funds, pay privately, and withdraw on your terms.
              </p>
            </div>
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-veilum-subtle">Product</h3>
              <div className="mt-4 flex flex-col gap-2 text-sm text-veilum-muted">
                <Link to="/dashboard" className="transition hover:text-veilum-text">
                  Dashboard
                </Link>
                <Link to="/about" className="transition hover:text-veilum-text">
                  About Veilum
                </Link>
              </div>
            </div>
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-veilum-subtle">
                What&apos;s private
              </h3>
              <div className="mt-4 flex flex-col gap-2 text-sm text-veilum-muted">
                <span>Adding funds is public</span>
                <span>Payments between users are private</span>
                <span>Withdrawals are public</span>
              </div>
            </div>
          </div>
          <div className="border-t border-veilum-border/60 px-4 py-6 text-center text-xs text-veilum-subtle md:px-6">
            Testnet preview — not financial advice. Your keys stay on your device and are never sent to us.
          </div>
        </footer>
      </div>
    </LandingAuthGate>
  );
}
