import { toast, type Id } from "react-toastify";

import { TxLink } from "../components/ui/TxLink";

const TOAST_OPTS = {
  position: "bottom-right" as const,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
};

export function notifyLoading(message: string): Id {
  return toast.loading(message, TOAST_OPTS);
}

export function notifySuccess(message: string, txHash?: string | null): void {
  const hash = txHash?.replace(/^0x/i, "").toLowerCase();
  if (hash && /^[0-9a-f]{64}$/.test(hash)) {
    toast.success(
      <div className="toast-message">
        <p className="toast-message__text">{message}</p>
        <p className="toast-message__link">
          <TxLink txHash={hash} shorten={10} />
        </p>
      </div>,
      { ...TOAST_OPTS, autoClose: 8000 }
    );
    return;
  }
  toast.success(message, { ...TOAST_OPTS, autoClose: 6000 });
}

export function notifyError(message: string): void {
  toast.error(message, { ...TOAST_OPTS, autoClose: 10000 });
}

export function notifyInfo(message: string): void {
  toast.info(message, { ...TOAST_OPTS, autoClose: 6000 });
}

export function dismissNotify(id: Id): void {
  toast.dismiss(id);
}

/** Dismiss a loading toast and show success or error. */
export function finishNotify(
  id: Id,
  outcome: { ok: true; message: string; txHash?: string | null } | { ok: false; message: string }
): void {
  toast.dismiss(id);
  if (outcome.ok) notifySuccess(outcome.message, outcome.txHash);
  else notifyError(outcome.message);
}
