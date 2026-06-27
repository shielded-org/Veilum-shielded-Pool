import { cn } from "../../../lib/cn";

export function Spotlight({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="animate-spotlight absolute -top-40 left-0 h-[520px] w-[520px] rounded-full opacity-0 blur-3xl md:-top-20 md:left-1/2 md:-translate-x-1/2"
        style={{
          background:
            "radial-gradient(circle, var(--spotlight) 0%, color-mix(in srgb, var(--spotlight) 35%, transparent) 35%, transparent 70%)",
        }}
      />
    </div>
  );
}
