import { STABLE_CATALOG, type StableSymbol } from "../../../lib/tokens";
import { cn } from "../../../lib/cn";

const STABLE_SYMBOLS = ["USDC", "EURC", "YLDS", "MGUSD"] as const satisfies readonly StableSymbol[];

const PARTNERS = [
  { name: "Stellar", src: "/logos/stellar.png" },
  { name: "Freighter", src: "/logos/freighter.png" },
  { name: "Albedo", src: "/logos/albedo.png" },
] as const;

const LOGOS = [
  ...PARTNERS.slice(0, 1),
  ...STABLE_SYMBOLS.map((symbol) => ({
    name: symbol,
    src: `/logos/${symbol.toLowerCase()}.png`,
    label: STABLE_CATALOG[symbol].name,
  })),
  ...PARTNERS.slice(1),
] as const;

function LogoRow() {
  return (
    <>
      {LOGOS.map((logo) => (
        <li
          key={logo.name}
          className="flex shrink-0 items-center gap-3 rounded-full border border-veilum-border/60 bg-veilum-elevated/40 px-4 py-2"
        >
          <span className="lp-logo-chip flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full p-1">
            <img
              src={logo.src}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </span>
          <span className="whitespace-nowrap text-sm text-veilum-muted">
            {"label" in logo && logo.label ? logo.label : logo.name}
          </span>
        </li>
      ))}
    </>
  );
}

export function InfiniteMovingLogos({
  direction = "left",
  speed = "slow",
  pauseOnHover = true,
  className,
}: {
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) {
  const duration = speed === "fast" ? "22s" : speed === "normal" ? "36s" : "52s";

  return (
    <div
      className={cn(
        "relative flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className
      )}
    >
      <ul
        className={cn(
          "flex w-max min-w-full shrink-0 animate-scroll items-center gap-10 py-2",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
        style={
          {
            "--animation-duration": duration,
            "--animation-direction": direction === "left" ? "forwards" : "reverse",
          } as React.CSSProperties
        }
      >
        <LogoRow />
        <LogoRow />
        <LogoRow />
        <LogoRow />
      </ul>
    </div>
  );
}
