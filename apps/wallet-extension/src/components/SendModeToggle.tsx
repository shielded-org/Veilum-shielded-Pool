export type SendMode = "private" | "unshield";

export function SendModeToggle({
  mode,
  onModeChange,
}: {
  mode: SendMode;
  onModeChange: (mode: SendMode) => void;
}) {
  return (
    <div className="send-mode-toggle" role="tablist" aria-label="Send mode">
      <button
        type="button"
        role="tab"
        className={`send-mode-toggle__btn send-mode-toggle__btn--private${
          mode === "private" ? " send-mode-toggle__btn--active" : ""
        }`}
        aria-selected={mode === "private"}
        onClick={() => onModeChange("private")}
      >
        <span className="send-mode-toggle__dot send-mode-toggle__dot--private" aria-hidden />
        Private
      </button>
      <button
        type="button"
        role="tab"
        className={`send-mode-toggle__btn send-mode-toggle__btn--withdraw${
          mode === "unshield" ? " send-mode-toggle__btn--active" : ""
        }`}
        aria-selected={mode === "unshield"}
        onClick={() => onModeChange("unshield")}
      >
        <span className="send-mode-toggle__dot send-mode-toggle__dot--public" aria-hidden />
        Withdraw
      </button>
    </div>
  );
}
