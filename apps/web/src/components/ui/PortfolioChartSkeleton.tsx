export function PortfolioChartSkeleton() {
  return (
    <div className="portfolio-chart portfolio-chart--loading" aria-label="Loading allocation" aria-busy="true">
      <div className="portfolio-chart__donut">
        <span className="balance-skeleton balance-skeleton--donut" />
      </div>
      <div className="portfolio-bars portfolio-bars--loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="portfolio-bar portfolio-bar--loading">
            <span className="balance-skeleton balance-skeleton--chip" />
            <span className="balance-skeleton balance-skeleton--bar" />
            <span className="balance-skeleton balance-skeleton--short" />
          </div>
        ))}
      </div>
    </div>
  );
}
