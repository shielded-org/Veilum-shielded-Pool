export function BalanceItemSkeleton() {
  return (
    <article className="balance-item balance-item--loading" aria-label="Loading balance" aria-busy="true">
      <div className="balance-item__top">
        <span className="balance-skeleton balance-skeleton--chip" />
        <span className="balance-skeleton balance-skeleton--short" />
      </div>
      <span className="balance-skeleton balance-skeleton--line" />
      <span className="balance-skeleton balance-skeleton--amount" />
      <span className="balance-skeleton balance-skeleton--fiat" />
    </article>
  );
}
