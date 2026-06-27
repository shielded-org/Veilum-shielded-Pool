import { motion } from "framer-motion";

const ROWS = [
  { label: "Shielded balance", value: "$2,400.00", private: true },
  { label: "Private payment", value: "Delivered", private: true },
  { label: "Public deposit", value: "$500.00 USDC", private: false },
] as const;

export function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="relative mx-auto w-full max-w-md"
    >
      <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-veilum-accent/20 via-transparent to-veilum-accent/5 blur-2xl" />
      <div className="relative overflow-hidden rounded-[24px] border border-veilum-border bg-veilum-terminal shadow-veilum-hero">
        <div className="flex items-center gap-2 border-b border-veilum-border/80 px-4 py-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          </span>
          <span className="font-mono text-[11px] text-veilum-subtle">veilum dashboard</span>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-veilum-accent/25 bg-veilum-accent/10 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-veilum-subtle">Total shielded</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-veilum-text">$2,400.00</p>
            <p className="mt-1 text-xs text-veilum-muted">USDC · EURC · more stables</p>
          </div>

          <div className="space-y-2">
            {ROWS.map((row, i) => (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.1 }}
                className="flex items-center justify-between rounded-lg border border-veilum-border/70 bg-veilum-bg/40 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-veilum-text">{row.label}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-veilum-subtle">
                    {row.private ? "Private on-chain" : "Public on Stellar"}
                  </p>
                </div>
                <span
                  className={
                    row.private
                      ? "rounded-full bg-veilum-accent/15 px-2 py-0.5 font-mono text-[10px] text-veilum-accent"
                      : "font-mono text-xs text-veilum-muted"
                  }
                >
                  {row.value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
