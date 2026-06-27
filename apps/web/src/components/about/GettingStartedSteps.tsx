import { motion } from "framer-motion";

type Step = { title: string; detail: string };

export function GettingStartedSteps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <motion.li
          key={step.title}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05 }}
          className="flex gap-4 rounded-xl border border-veilum-border/70 bg-veilum-bg/30 p-4"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-veilum-accent/10 font-mono text-sm text-veilum-accent">
            {i + 1}
          </span>
          <div>
            <p className="font-medium text-veilum-text">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-veilum-muted">{step.detail}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
