import { motion } from "framer-motion";

import { cn } from "../../lib/cn";

type TimelineItem = {
  title: string;
  detail: string;
  tone: "public" | "private";
};

export function AboutTimeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <div className="relative mx-auto max-w-2xl pl-2">
      <div
        className="absolute left-[11px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-veilum-border via-veilum-accent/40 to-veilum-border"
        aria-hidden
      />
      <ol className="space-y-8">
        {items.map((item, i) => (
          <motion.li
            key={item.title}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06 }}
            className="relative flex gap-5 pl-8"
          >
            <span
              className={cn(
                "absolute left-0 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-veilum-bg",
                item.tone === "private"
                  ? "border-veilum-accent shadow-[0_0_12px_oklch(78%_0.14_175_/_0.25)]"
                  : "border-veilum-border"
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  item.tone === "private" ? "bg-veilum-accent" : "bg-veilum-subtle"
                )}
              />
            </span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-veilum-text">{item.title}</h3>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                    item.tone === "private"
                      ? "bg-veilum-accent/15 text-veilum-accent"
                      : "border border-veilum-border text-veilum-subtle"
                  )}
                >
                  {item.tone === "private" ? "Private" : "Public"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-veilum-muted">{item.detail}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
