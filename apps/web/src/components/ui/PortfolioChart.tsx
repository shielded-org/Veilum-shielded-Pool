import type { BalanceAsset } from "./BalanceOverview";

const TOKEN_COLORS: Record<string, string> = {
  USDC: "oklch(78% 0.14 175)",
  EURC: "oklch(68% 0.14 250)",
  YLDS: "oklch(78% 0.12 85)",
  MGUSD: "oklch(74% 0.11 65)",
};

const FALLBACK_COLORS = [
  "oklch(78% 0.14 175)",
  "oklch(68% 0.14 250)",
  "oklch(78% 0.12 85)",
  "oklch(74% 0.11 65)",
  "oklch(72% 0.16 155)",
];

type PortfolioChartProps = {
  assets: BalanceAsset[];
  reveal: boolean;
};

type Segment = {
  symbol: string;
  pct: number;
  color: string;
};

function buildSegments(assets: BalanceAsset[]): Segment[] {
  const total = assets.reduce((sum, a) => sum + a.amount, 0n);
  if (total <= 0n) return [];

  return assets
    .map((asset, i) => ({
      symbol: asset.symbol,
      pct: Number((asset.amount * 10000n) / total) / 100,
      color: TOKEN_COLORS[asset.symbol] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }))
    .sort((a, b) => b.pct - a.pct);
}

function formatPct(pct: number, reveal: boolean) {
  if (!reveal) return "••%";
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function PortfolioChart({ assets, reveal }: PortfolioChartProps) {
  const segments = buildSegments(assets);
  const radius = 36;
  const stroke = 12;
  const center = 48;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="portfolio-chart" aria-label="Portfolio allocation">
      <div className="portfolio-chart__donut">
        <svg viewBox="0 0 96 96" className="portfolio-chart__svg" role="img" aria-hidden>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
          />
          {reveal &&
            segments.map((seg) => {
              const length = (seg.pct / 100) * circumference;
              const dashoffset = -offset;
              offset += length;
              return (
                <circle
                  key={seg.symbol}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashoffset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${center} ${center})`}
                />
              );
            })}
        </svg>
        <div className="portfolio-chart__center">
          <span className="portfolio-chart__center-label">Assets</span>
          <strong className="portfolio-chart__center-value">
            {reveal ? segments.length : "••"}
          </strong>
        </div>
      </div>

      <div className="portfolio-bars" role="list" aria-label="Allocation by asset">
        {segments.map((seg) => (
          <div key={seg.symbol} className="portfolio-bar" role="listitem">
            <span className="portfolio-bar__label">{seg.symbol}</span>
            <div className="portfolio-bar__track" aria-hidden>
              <div
                className="portfolio-bar__fill"
                style={{
                  width: reveal ? `${Math.max(seg.pct, seg.pct > 0 ? 2 : 0)}%` : "40%",
                  background: seg.color,
                  opacity: reveal ? 1 : 0.35,
                }}
              />
            </div>
            <span className="portfolio-bar__pct mono">{formatPct(seg.pct, reveal)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
