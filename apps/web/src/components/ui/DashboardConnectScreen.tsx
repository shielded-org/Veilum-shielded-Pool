import { IconSpinner } from "./icons";
import { isMobileWalletDevice } from "../../lib/wallet-kit";

type DashboardConnectScreenProps = {
  busy: boolean;
  onConnect: () => void;
  error?: string | null;
  mode?: "connect" | "sign";
};

export function DashboardConnectScreen({
  busy,
  onConnect,
  error,
  mode = "connect",
}: DashboardConnectScreenProps) {
  const mobile = isMobileWalletDevice();
  const signing = mode === "sign";

  return (
    <div className="dashboard-connect-screen">
      <div className="dashboard-connect-screen__card">
        <span className="dashboard-connect-screen__icon" aria-hidden>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect
              x="8"
              y="14"
              width="32"
              height="24"
              rx="6"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.35"
            />
            <circle cx="32" cy="26" r="3" fill="currentColor" opacity="0.5" />
            <path
              d="M14 22h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.3"
            />
          </svg>
        </span>
        <h2 className="dashboard-connect-screen__title">
          {signing ? "Almost there — unlock your balance" : "Connect your wallet"}
        </h2>
        <p className="dashboard-connect-screen__body">
          {signing
            ? "Approve the quick message in your wallet to finish setup. It is not a payment — just the keys Veilum needs on your device."
            : "Choose Freighter, Albedo, xBull, or Lobstr to get started with private stablecoin payments."}
        </p>
        {mobile && !signing ? (
          <p className="dashboard-connect-screen__hint">
            On mobile, open this site in the <strong>xBull</strong> or <strong>Albedo</strong> in-app
            browser for reliable transaction signing.
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onConnect}
          disabled={busy}
        >
          {busy ? (
            <>
              <IconSpinner size={16} /> {signing ? "Waiting for signature…" : "Connecting…"}
            </>
          ) : signing ? (
            "Continue in wallet"
          ) : (
            "Connect Wallet"
          )}
        </button>
        {error ? (
          <p className="badge err dashboard-connect-screen__error">{error}</p>
        ) : null}
        {!signing ? (
          <p className="dashboard-connect-screen__hint">
            You can also use the wallet button in the top right.
          </p>
        ) : null}
      </div>
    </div>
  );
}
