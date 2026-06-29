export type WalletBalanceMode = "private" | "public";

export function WalletModeToggle({
  mode,
  onModeChange,
}: {
  mode: WalletBalanceMode;
  onModeChange: (mode: WalletBalanceMode) => void;
}) {
  return (
    <div className="wallet-mode-toggle" role="tablist" aria-label="Balance mode">
      <button
        type="button"
        role="tab"
        className={mode === "private" ? "active" : ""}
        aria-selected={mode === "private"}
        onClick={() => onModeChange("private")}
      >
        <span className="wallet-mode-toggle__dot wallet-mode-toggle__dot--private" aria-hidden />
        Private
      </button>
      <button
        type="button"
        role="tab"
        className={mode === "public" ? "active" : ""}
        aria-selected={mode === "public"}
        onClick={() => onModeChange("public")}
      >
        <span className="wallet-mode-toggle__dot wallet-mode-toggle__dot--public" aria-hidden />
        Public
      </button>
    </div>
  );
}
