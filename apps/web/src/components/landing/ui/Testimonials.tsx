import { motion } from "framer-motion";

const TESTIMONIALS = [
  {
    quote:
      "Finally a way to move USDC on Stellar without every payment showing up in a block explorer. Deposits and withdrawals stay auditable — everything in between is actually private.",
    name: "Alex M.",
    role: "Freelance payments",
  },
  {
    quote:
      "The ASP model clicked for us immediately. Compliance checks happen where regulators expect them — at the edges — not on every internal transfer.",
    name: "Priya S.",
    role: "Fintech ops",
  },
  {
    quote:
      "Proof generation happens in the browser, keys never leave the device, and the dashboard tells you exactly what is public vs private. That transparency builds trust.",
    name: "Jordan K.",
    role: "Wallet integrator",
  },
] as const;

export function Testimonials() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {TESTIMONIALS.map((item, i) => (
        <motion.blockquote
          key={item.name}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08 }}
          className="flex flex-col rounded-2xl border border-veilum-border bg-veilum-elevated/35 p-6"
        >
          <p className="flex-1 text-sm leading-relaxed text-veilum-muted">&ldquo;{item.quote}&rdquo;</p>
          <footer className="mt-6 border-t border-veilum-border/60 pt-4">
            <cite className="not-italic">
              <span className="block text-sm font-medium text-veilum-text">{item.name}</span>
              <span className="text-xs text-veilum-subtle">{item.role}</span>
            </cite>
          </footer>
        </motion.blockquote>
      ))}
    </div>
  );
}
