import { IconSpinner } from "./icons";

type DashboardConnectScreenProps = {
  busy: boolean;
  onConnect: () => void;
};

export function DashboardConnectScreen({ busy, onConnect }: DashboardConnectScreenProps) {
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
        <h2 className="dashboard-connect-screen__title">Connect your wallet</h2>
        <p className="dashboard-connect-screen__body">
          Sign in with Freighter, xBull, Albedo, or Lobstr to derive shield keys, view your private
          balance, and use the pool.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onConnect}
          disabled={busy}
        >
          {busy ? (
            <>
              <IconSpinner size={16} /> Connecting…
            </>
          ) : (
            "Connect Wallet"
          )}
        </button>
        <p className="dashboard-connect-screen__hint">
          You can also use the wallet button in the top right.
        </p>
      </div>
    </div>
  );
}
