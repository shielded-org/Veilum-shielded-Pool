import { cn } from "../../../lib/cn";

export function BackgroundGrid({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]",
        className
      )}
    >
      <div className="absolute inset-0 bg-grid-white bg-[length:48px_48px] opacity-[0.35]" />
      <div className="absolute inset-0 bg-gradient-to-b from-veilum-bg via-transparent to-veilum-bg" />
    </div>
  );
}
