import { cn } from "../../lib/cn";
import type { DisplayCurrency } from "../../lib/portfolio-value";
import { useDisplayCurrency } from "../../hooks/use-display-currency";

type DisplayCurrencyToggleProps = {
  className?: string;
};

export function DisplayCurrencyToggle({ className }: DisplayCurrencyToggleProps) {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  return (
    <div
      className={cn("display-currency-toggle", className)}
      role="group"
      aria-label="Display currency"
    >
      {(["USD", "EUR"] as const).map((code) => (
        <button
          key={code}
          type="button"
          className={cn(
            "display-currency-toggle__btn",
            displayCurrency === code && "display-currency-toggle__btn--active"
          )}
          aria-pressed={displayCurrency === code}
          onClick={() => setDisplayCurrency(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
