import { cn } from "../../../lib/cn";

type BentoItem = {
  title: string;
  description: string;
  className?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
};

export function BentoGrid({ items }: { items: BentoItem[] }) {
  return (
    <div className="grid auto-rows-[minmax(11rem,auto)] grid-cols-1 gap-4 md:grid-cols-6">
      {items.map((item) => (
        <article
          key={item.title}
          className={cn(
            "group relative overflow-hidden rounded-2xl border border-veilum-border bg-veilum-elevated/40 p-6 transition hover:border-veilum-accent/30",
            item.highlight &&
              "border-veilum-accent/25 bg-gradient-to-br from-veilum-accent/10 via-veilum-elevated/40 to-veilum-elevated/20",
            item.className
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-veilum-accent/10 blur-2xl transition group-hover:bg-veilum-accent/15" />
          {item.icon ? (
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-veilum-border bg-veilum-bg/60 text-veilum-accent">
              {item.icon}
            </div>
          ) : null}
          <h3 className="mb-2 text-lg font-semibold tracking-tight text-veilum-text">{item.title}</h3>
          <p className="text-sm leading-relaxed text-veilum-muted">{item.description}</p>
        </article>
      ))}
    </div>
  );
}
