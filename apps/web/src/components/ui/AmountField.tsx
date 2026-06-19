import { formatTokenAmount, parseTokenAmount } from "../../lib/utils";

type AmountFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  symbol: string;
  /** Max spendable amount for Max / % shortcuts (optional). */
  maxAmount?: bigint;
  disabled?: boolean;
  hint?: string;
};

const FIAT_PLACEHOLDER = "≈ —";

export function AmountField({
  id,
  label,
  value,
  onChange,
  symbol,
  maxAmount,
  disabled,
  hint,
}: AmountFieldProps) {
  const parsed = (() => {
    try {
      return parseTokenAmount(value || "0");
    } catch {
      return null;
    }
  })();

  const invalid = value !== "" && parsed === null;
  const exceedsMax =
    maxAmount !== undefined && parsed !== null && parsed > maxAmount;

  function setFraction(num: number, den: number) {
    if (maxAmount === undefined || maxAmount <= 0n) return;
    const part = (maxAmount * BigInt(num)) / BigInt(den);
    onChange(formatTokenAmount(part));
  }

  return (
    <div className={`amount-field${invalid || exceedsMax ? " amount-field--invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="amount-field__row">
        <input
          id={id}
          className="input amount-field__input"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || exceedsMax}
        />
        <span className="amount-field__symbol">{symbol}</span>
      </div>
      <div className="amount-field__meta">
        <span className="amount-field__fiat">{FIAT_PLACEHOLDER}</span>
        {maxAmount !== undefined && maxAmount > 0n ? (
          <div className="amount-field__shortcuts">
            <button type="button" className="amount-field__chip" disabled={disabled} onClick={() => onChange(formatTokenAmount(maxAmount))}>
              Max
            </button>
            <button type="button" className="amount-field__chip" disabled={disabled} onClick={() => setFraction(1, 2)}>
              50%
            </button>
            <button type="button" className="amount-field__chip" disabled={disabled} onClick={() => setFraction(1, 4)}>
              25%
            </button>
          </div>
        ) : null}
      </div>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {invalid ? <p className="amount-field__error">Enter a valid amount.</p> : null}
      {exceedsMax ? <p className="amount-field__error">Insufficient balance for this note.</p> : null}
    </div>
  );
}
