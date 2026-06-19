import { toast, type Id } from "react-toastify";

import { VeilumToast, veilumToastClass } from "../components/ui/VeilumToast";

const TOAST_OPTS = {
  position: "bottom-right" as const,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  icon: false as const,
  progressClassName: "veilum-toast__progress",
};

type ToastOutcome = {
  title: string;
  detail?: string;
  txHash?: string | null;
};

export const contractSuccess = {
  shield(amount: string, symbol: string): ToastOutcome {
    return {
      title: "Shield confirmed",
      detail: `${amount} ${symbol} added to your private balance`,
    };
  },
  transfer(): ToastOutcome {
    return {
      title: "Transfer confirmed",
      detail: "Private payment submitted on-chain",
    };
  },
  unshield(): ToastOutcome {
    return {
      title: "Withdrawal confirmed",
      detail: "Funds sent to your public wallet",
    };
  },
  mint(amount: string, symbol: string, balanceLabel: string): ToastOutcome {
    return {
      title: "Tokens minted",
      detail: `${amount} ${symbol} minted · balance ${balanceLabel}`,
    };
  },
  xlm(balanceLabel: string): ToastOutcome {
    return {
      title: "XLM funded",
      detail: `Testnet lumens added · balance ${balanceLabel}`,
    };
  },
} as const;

export function notifyLoading(message: string): Id {
  return toast.loading(
    <VeilumToast variant="loading" title={message} />,
    { ...TOAST_OPTS, className: veilumToastClass("loading") }
  );
}

export function notifySuccess(outcome: ToastOutcome): void {
  toast.success(
    <VeilumToast variant="success" title={outcome.title} detail={outcome.detail} txHash={outcome.txHash} />,
    { ...TOAST_OPTS, className: veilumToastClass("success"), autoClose: 8000 }
  );
}

export function notifyError(title: string, detail?: string): void {
  toast.error(
    <VeilumToast variant="error" title={title} detail={detail} />,
    { ...TOAST_OPTS, className: veilumToastClass("error"), autoClose: 10000 }
  );
}

export function notifyInfo(title: string, detail?: string): void {
  toast.info(
    <VeilumToast variant="info" title={title} detail={detail} />,
    { ...TOAST_OPTS, className: veilumToastClass("info"), autoClose: 6000 }
  );
}

export function dismissNotify(id: Id): void {
  toast.dismiss(id);
}

/** Dismiss a loading toast and show a branded success or error toast. */
export function finishNotify(
  id: Id,
  outcome:
    | ({ ok: true } & ToastOutcome)
    | { ok: false; title: string; detail?: string; message?: string }
): void {
  toast.dismiss(id);
  if (outcome.ok) {
    notifySuccess({
      title: outcome.title,
      detail: outcome.detail,
      txHash: outcome.txHash,
    });
    return;
  }
  const title = outcome.title ?? outcome.message ?? "Something went wrong";
  notifyError(title, outcome.detail);
}
