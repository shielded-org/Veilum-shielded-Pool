import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect } from "react";

import { LandingAuthCTA } from "../components/landing/LandingAuthCTA";
import { AboutTimeline } from "../components/about/AboutTimeline";
import { GettingStartedSteps } from "../components/about/GettingStartedSteps";
import { BackgroundGrid } from "../components/landing/ui/BackgroundGrid";
import { Spotlight } from "../components/landing/ui/Spotlight";

const PRIVACY_FLOW = [
  {
    title: "Add funds",
    detail:
      "Move USDC or other stablecoins into Veilum from your wallet. Your address and the amount show on Stellar — the same as any normal transfer.",
    tone: "public" as const,
  },
  {
    title: "Pay privately",
    detail:
      "Send to someone using their Veilum receive address. Who paid whom and how much stays off the public record. The network still verifies the payment is valid.",
    tone: "private" as const,
  },
  {
    title: "Withdraw",
    detail:
      "Cash out to any Stellar wallet when you are ready. The destination and amount are public again. Anything you leave in Veilum can stay private.",
    tone: "public" as const,
  },
];

const CAPABILITIES = [
  "Hold USDC, EURC, and other Stellar stablecoins in one private balance",
  "Send payments without exposing sender, recipient, or amount",
  "Withdraw part of a balance and keep the rest private",
  "Share a receive address — senders do not need a Veilum account",
  "Compliance checks when you add or withdraw funds",
  "Keys stay on your device; Veilum never sees them",
];

const UNDER_THE_HOOD = [
  {
    title: "On Stellar",
    detail:
      "Balances live in a shared pool on the network. Every private payment is cryptographically verified before it counts.",
  },
  {
    title: "On your device",
    detail:
      "Your browser prepares and encrypts payments locally. Sensitive details never pass through our servers.",
  },
  {
    title: "Your keys",
    detail:
      "Unlocked with a one-time wallet approval. They never leave your browser and are never stored by Veilum.",
  },
];

const GETTING_STARTED = [
  {
    title: "Connect your wallet",
    detail: "Use Freighter, xBull, Albedo, or Lobstr on Stellar testnet.",
  },
  {
    title: "Get test tokens",
    detail: "Open the Faucet in the dashboard for free play-money USDC.",
  },
  {
    title: "Add funds",
    detail: "Shield tokens into your private balance from the dashboard.",
  },
  {
    title: "Send a private payment",
    detail: "Paste a recipient's Veilum address on the Transfer page. They'll see it in their balance.",
  },
];

export function AboutPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  return (
    <div className="relative">
      {/* Page header — editorial, not a marketing hero */}
      <section className="relative border-b border-veilum-border/60 pb-14 pt-4 md:pb-20">
        <BackgroundGrid className="opacity-60" />
        <Spotlight />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-3xl px-4 md:px-6 lg:px-8"
        >
         
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text md:text-4xl">
            Private stablecoin payments, explained plainly
          </h1>
          <p className="mt-5 text-base leading-relaxed text-veilum-muted md:text-lg">
            Veilum brings confidential USDC and stablecoin payments to Stellar. We built it for people who
            want everyday payments without broadcasting every send — and for teams who need compliance at the
            edges, not on every transfer.
          </p>
        </motion.div>
      </section>

      {/* Privacy flow */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-veilum-text">How privacy works</h2>
          <p className="mt-3 text-veilum-muted">
            Veilum is honest about what is public and what stays between you and the recipient. Most of the
            time, that means two clear boundaries with private payments in the middle.
          </p>
        </div>
        <AboutTimeline items={PRIVACY_FLOW} />
      </section>

      {/* What you can do */}
      <section className="border-y border-veilum-border/60 bg-veilum-elevated/15 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2 md:px-6 lg:px-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-veilum-text">What you can do</h2>
            <p className="mt-3 text-veilum-muted">
              Same stablecoins you already use on Stellar — with control over who sees each payment.
            </p>
          </div>
          <ul className="space-y-3">
            {CAPABILITIES.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-3 text-sm leading-relaxed text-veilum-muted"
              >
                <span className="mt-0.5 text-veilum-accent">✓</span>
                <span>{item}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      {/* Under the hood — brief, not a feature grid */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-veilum-text">Under the hood</h2>
          <p className="mt-3 text-veilum-muted">
            You do not need to understand the cryptography to use Veilum — but here is the short version if
            you are curious.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {UNDER_THE_HOOD.map((block, i) => (
            <motion.article
              key={block.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="lp-card p-5"
            >
              <h3 className="font-semibold text-veilum-text">{block.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-veilum-muted">{block.detail}</p>
            </motion.article>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-sm text-veilum-subtle">
          Veilum is live on Stellar testnet today. Private sends are submitted on your behalf so your wallet
          is not publicly linked to every payment.
        </p>
      </section>

      {/* Getting started — absorbs former how-to-use content */}
      <section
        id="getting-started"
        className="border-t border-veilum-border/60 bg-veilum-elevated/10 py-16"
      >
        <div className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-veilum-text">Getting started</h2>
          <p className="mt-3 text-veilum-muted">
            Four steps to your first private payment on testnet. You will need a Stellar wallet and a modern
            browser — no real money required.
          </p>
          <div className="mt-8">
            <GettingStartedSteps steps={GETTING_STARTED} />
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            <LandingAuthCTA variant="hero" />
            <Link to="/" className="lp-btn-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
