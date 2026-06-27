import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { LandingAuthCTA } from "../components/landing/LandingAuthCTA";
import { BackgroundGrid } from "../components/landing/ui/BackgroundGrid";
import { BentoGrid } from "../components/landing/ui/BentoGrid";
import { FaqAccordion } from "../components/landing/ui/FaqAccordion";
import { HeroPreview } from "../components/landing/ui/HeroPreview";
import { InfiniteMovingLogos } from "../components/landing/ui/InfiniteMovingLogos";
import { PricingCards } from "../components/landing/ui/PricingCards";
import { Spotlight } from "../components/landing/ui/Spotlight";
import { Testimonials } from "../components/landing/ui/Testimonials";

const FAQ = [
  {
    q: "What can other people see when I add money?",
    a: "Your wallet address and how much you deposited. Adding funds is a normal Stellar payment — that part is public by design, so you always know exactly what shows up on the ledger.",
  },
  {
    q: "What stays private when I send to someone?",
    a: "Who sent it, who received it, and how much moved. The payment is verified with zero-knowledge proofs without exposing those details to the public blockchain.",
  },
  {
    q: "Do I need to set anything up to send privately?",
    a: "Just connect your wallet and open the dashboard. Veilum handles proof generation and submission behind the scenes so you can focus on sending.",
  },
  {
    q: "Where are my keys kept?",
    a: "On your device, in your browser. You approve a one-time message from your wallet to unlock your private balance — nothing is stored on our servers.",
  },
  {
    q: "How does compliance work?",
    a: "When you add or withdraw funds, Veilum can run compliance checks at those boundaries — the same for everyday and business use. Private transfers in between stay confidential while deposits and withdrawals stay auditable.",
  },
] as const;

const SERVICES = [
  {
    title: "Shield",
    description:
      "Move USDC, EURC, and other Stellar stablecoins into your private balance. Deposits are public on the ledger — you always know what others can see.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3 4 7v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4z" />
      </svg>
    ),
  },
  {
    title: "Transfer",
    description:
      "Pay anyone with a Veilum receive address. Sender, recipient, and amount stay off the public record while the network still verifies the payment.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7 17 17 7M17 7H9M17 7v8" />
      </svg>
    ),
  },
  {
    title: "Unshield",
    description:
      "Withdraw to any Stellar wallet when you are ready. Withdrawals are public — the same clear boundary as when you first added funds.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
    ),
  },
] as const;

const BENTO = [
  {
    title: "Privacy with clear boundaries",
    description:
      "Every action in the dashboard labels what is public and what stays between you and the recipient. No guessing, no fine print.",
    className: "md:col-span-4",
    highlight: true,
  },
  {
    title: "Zero-knowledge verified",
    description: "Payments are proven valid on Soroban with Noir circuits — without revealing amounts or addresses.",
    className: "md:col-span-2",
  },
  {
    title: "Multi-stable support",
    description: "USDC, EURC, YLDS, MGUSD — each asset tracked separately inside one shared pool.",
    className: "md:col-span-2",
  },
  {
    title: "Works with your wallet",
    description: "Freighter, xBull, Albedo, or Lobstr. Connect once, approve a viewing key, and you are ready.",
    className: "md:col-span-2",
  },
  {
    title: "Compliance at the edges",
    description:
      "Policy checks when value enters and leaves the pool — private flows with clear, auditable boundaries.",
    className: "md:col-span-2",
    highlight: true,
  },
] as const;

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero */}
      <section className="relative px-0 pb-16 pt-8 md:pb-24 md:pt-12">
        <BackgroundGrid />
        <Spotlight />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:gap-16 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* <span className="lp-section-label">Private payments on Stellar</span> */}
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-veilum-text md:text-5xl lg:text-[3.25rem]">
              Stablecoin payments{" "}
              <span className="bg-gradient-to-r from-veilum-accent via-teal-200 to-veilum-accent bg-clip-text text-transparent">
                without the spotlight
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-veilum-muted md:text-lg">
              Veilum lets you hold, send, and receive USDC and other stablecoins on Stellar without broadcasting
              every payment. Add and withdraw like normal — what happens in between stays yours.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LandingAuthCTA variant="hero" />
              <Link to="/about" className="lp-btn-secondary">
                About Veilum
              </Link>
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-veilum-subtle">
              Testnet preview · Keys stay on your device
            </p>
          </motion.div>

          <HeroPreview />
        </div>
      </section>

      {/* Logo cloud */}
      <section className="border-y border-veilum-border/60 bg-veilum-elevated/20 py-6">
        <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-widest text-veilum-subtle">
          Built with the Stellar privacy stack
        </p>
        <InfiniteMovingLogos speed="slow" />
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text md:text-4xl">
            Three actions. One clear flow.
          </h2>
          <p className="mt-4 text-veilum-muted">
            Shield stablecoins into a private balance, pay someone confidentially, or unshield back to any wallet —
            each step tells you exactly what is visible on-chain.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((service, i) => (
            <motion.article
              key={service.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="lp-card group p-6 transition hover:border-veilum-accent/30"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-veilum-border bg-veilum-bg/50 text-veilum-accent">
                {service.icon}
              </div>
              <h3 className="text-xl font-semibold text-veilum-text">{service.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-veilum-muted">{service.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Bento features */}
      <section className="border-y border-veilum-border/60 bg-veilum-elevated/15 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <span className="lp-section-label">Why Veilum</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text md:text-4xl">
              Privacy you can see, not guess
            </h2>
            <p className="mt-4 text-veilum-muted">
              Cryptographic guarantees with a product experience that never hides the rules from you.
            </p>
          </div>
          <BentoGrid items={[...BENTO]} />
        </div>
      </section>

      {/* Plans / use cases */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text md:text-4xl">
            Pick the path that fits you
          </h2>
          <p className="mt-4 text-veilum-muted">
            From everyday testnet sends to compliance-ready business flows — developer tools on the way.
          </p>
        </div>
        <PricingCards />
      </section>

      {/* Testimonials */}
      <section className="border-y border-veilum-border/60 bg-veilum-elevated/15 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text">
              Trusted for real stablecoin flows
            </h2>
          </div>
          <Testimonials />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-veilum-text">
            Frequently Asked Questions
          </h2>
        </div>
        <FaqAccordion items={FAQ} />
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 md:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl border border-veilum-accent/20 bg-gradient-to-br from-veilum-accent/10 via-veilum-elevated/80 to-veilum-elevated/40 px-8 py-14 text-center md:px-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(78%_0.14_175_/_0.12),transparent_55%)]" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-veilum-text md:text-4xl">
              Try your first private payment
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-veilum-muted">
              Connect on testnet, grab play money from the faucet, and send a payment only you and the recipient
              can see.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <LandingAuthCTA variant="cta" />
              <Link to="/about" className="lp-btn-secondary">
                Learn more
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
