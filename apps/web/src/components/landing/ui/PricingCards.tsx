import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { cn } from "../../../lib/cn";

type Plan = {
  name: string;
  tagline: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  href?: string;
  featured?: boolean;
  comingSoon?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Everyday",
    tagline: "Send stablecoins without broadcasting every payment.",
    price: "Free",
    period: "on testnet",
    features: [
      "Shield USDC and other stables",
      "Private transfers between Veilum users",
      "Withdraw to any Stellar wallet",
      "Compliance checks when you add or withdraw funds",
      "Keys stay on your device",
    ],
    cta: "Try on testnet",
    href: "/dashboard",
  },
  {
    name: "Business",
    tagline: "Pay vendors and contractors with compliance at the edges.",
    price: "Compliance",
    period: "policy at boundaries",
    features: [
      "Public deposits & withdrawals for audit trails",
      "Private amounts and counterparties in between",
      "Identity checks when adding or withdrawing funds",
      "Built for regulated stablecoin flows",
    ],
    cta: "Learn more",
    href: "/about",
    featured: true,
  },
  {
    name: "Developers",
    tagline: "Integrate privacy into your Stellar app or wallet.",
    price: "Coming soon",
    period: "SDK",
    features: [
      "Soroban shielded pool on testnet",
      "Noir circuits with UltraHonk verification",
      "Indexer for fast merkle sync",
      "Relayer-friendly proof submission",
    ],
    cta: "Coming soon",
    comingSoon: true,
  },
];

export function PricingCards() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((plan, i) => (
        <motion.article
          key={plan.name}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.08 }}
          className={cn(
            "relative flex flex-col rounded-2xl border p-6 lg:p-8",
            plan.featured
              ? "border-veilum-accent/30 bg-gradient-to-b from-veilum-accent/10 via-veilum-elevated/60 to-veilum-elevated/30 shadow-lg shadow-veilum-accent/5"
              : "border-veilum-border bg-veilum-elevated/40",
            plan.comingSoon && "opacity-90"
          )}
        >
          {plan.featured ? (
            <span className="mb-4 inline-flex w-fit rounded-full bg-veilum-accent/15 px-3 py-1 text-xs font-medium text-veilum-accent">
              Most popular
            </span>
          ) : null}
          {plan.comingSoon ? (
            <span className="mb-4 inline-flex w-fit rounded-full border border-veilum-border bg-veilum-bg/50 px-3 py-1 text-xs font-medium text-veilum-subtle">
              Coming soon
            </span>
          ) : null}
          <h3 className="text-xl font-semibold text-veilum-text">{plan.name}</h3>
          <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-veilum-muted">{plan.tagline}</p>
          <div className="my-6 border-b border-veilum-border/70 pb-6">
            <p className="text-3xl font-semibold tracking-tight text-veilum-text">{plan.price}</p>
            {plan.period ? <p className="mt-1 text-sm text-veilum-subtle">{plan.period}</p> : null}
          </div>
          <ul className="mb-8 flex-1 space-y-3">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-veilum-muted">
                <span className="mt-0.5 text-veilum-accent">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          {plan.comingSoon ? (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center rounded-full border border-veilum-border bg-veilum-bg/30 px-5 py-2.5 text-sm font-medium text-veilum-subtle"
              aria-disabled="true"
            >
              {plan.cta}
            </span>
          ) : (
            <Link
              to={plan.href!}
              className={cn(
                "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition",
                plan.featured
                  ? "bg-veilum-accent text-veilum-bg hover:brightness-110"
                  : "border border-veilum-border bg-veilum-bg/50 text-veilum-text hover:border-veilum-accent/40"
              )}
            >
              {plan.cta}
            </Link>
          )}
        </motion.article>
      ))}
    </div>
  );
}
