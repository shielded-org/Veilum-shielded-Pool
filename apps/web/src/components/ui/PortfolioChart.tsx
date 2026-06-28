import type { BalanceAsset } from "./BalanceOverview";
import { amountToUsd } from "../../lib/portfolio-value";

const TOKEN_COLORS: Record<string, string> = {
  USDC: "var(--chart-1)",
  EURC: "var(--chart-2)",
  YLDS: "var(--chart-3)",
  MGUSD: "var(--chart-4)",
};

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--success)",
];

type PortfolioChartProps = {
  assets: BalanceAsset[];
  reveal: boolean;
  /** 1 EUR = eurUsd USD — used so EURC share reflects dollar value. */
  eurUsd: number;
};

type Segment = {
  symbol: string;
  pct: number;
  color: string;
};

function buildSegments(assets: BalanceAsset[], eurUsd: number): Segment[] {
  const weights = assets.map((asset, i) => ({
    symbol: asset.symbol,
    weight: amountToUsd(asset.amount, asset.symbol, eurUsd),
    color: TOKEN_COLORS[asset.symbol] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return [];

  return weights
    .map((row) => ({
      symbol: row.symbol,
      pct: (row.weight / total) * 100,
      color: row.color,
    }))
    .sort((a, b) => b.pct - a.pct);
}

function formatPct(pct: number, reveal: boolean) {
  if (!reveal) return "••%";
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function PortfolioChart({ assets, reveal, eurUsd }: PortfolioChartProps) {
  const segments = buildSegments(assets, eurUsd);
  const radius = 36;
  const stroke = 18;
  const center = 48;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segmentGap = segments.length > 1 ? 2 : 0;

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
              const gap = segmentGap;
              const length = Math.max(0, (seg.pct / 100) * circumference - gap);
              const dashoffset = -offset;
              offset += length + gap;
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
                  strokeLinecap="round"
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
