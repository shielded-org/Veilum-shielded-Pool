import { TxLink } from "./TxLink";
import { IconSpinner } from "./icons";

type VeilumToastProps = {
  variant: "success" | "error" | "info" | "loading";
  title: string;
  detail?: string;
  txHash?: string | null;
};

function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlert({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconInfo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function normalizeTxHash(txHash?: string | null): string | null {
  const hash = txHash?.replace(/^0x/i, "").toLowerCase();
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  return hash;
}

export function VeilumToast({ variant, title, detail, txHash }: VeilumToastProps) {
  const hash = normalizeTxHash(txHash);

  return (
    <div className="veilum-toast__body">
      <div className={`veilum-toast__icon veilum-toast__icon--${variant}`} aria-hidden>
        {variant === "success" ? <IconCheck /> : null}
        {variant === "error" ? <IconAlert /> : null}
        {variant === "info" ? <IconInfo /> : null}
        {variant === "loading" ? <IconSpinner size={18} /> : null}
      </div>
      <div className="veilum-toast__content">
        <p className="veilum-toast__title">{title}</p>
        {detail ? <p className="veilum-toast__detail">{detail}</p> : null}
        {hash ? (
          <p className="veilum-toast__tx">
            <TxLink txHash={hash} shorten={10} className="veilum-toast__tx-link" />
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function veilumToastClass(variant: VeilumToastProps["variant"]): string {
  return `veilum-toast veilum-toast--${variant}`;
}
