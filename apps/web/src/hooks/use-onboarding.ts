import { useMemo } from "react";

import { useWallet } from "./use-wallet";
import { useShieldedStore } from "../store/use-shielded-store";

export type OnboardingStep = {
  id: string;
  label: string;
  description: string;
  to: string;
  done: boolean;
  testnetOnly?: boolean;
};

export function useOnboardingSteps() {
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const notes = useShieldedStore((s) => s.notes);
  const transactions = useShieldedStore((s) => s.transactions);
  const hasKeys = useShieldedStore((s) => !!(s.viewingKey && s.spendingKey && s.viewingPub));
  const dismissed = useShieldedStore((s) => s.onboardingDismissed);

  const isTestnet = network === "testnet" || network === "futurenet" || network === "local";

  const steps = useMemo(() => {
    const connected = !!(wallet && hasKeys);
    const hasShieldedNote = notes.some((n) => !n.spent) || notes.length > 0;
    const hasPrivateTransfer = transactions.some(
      (tx) => tx.type === "transfer" && tx.status === "confirmed"
    );

    const all: OnboardingStep[] = [
      {
        id: "connect",
        label: "Connect wallet",
        description: "Link Freighter or xBull and sign the one-time key derivation.",
        to: "/dashboard",
        done: connected,
      },
      {
        id: "faucet",
        label: "Mint test tokens",
        description: "Get mock USDC from the faucet to fund your first shield deposit.",
        to: "/dashboard/faucet",
        done:
          connected &&
          (hasShieldedNote ||
            transactions.some((t) => t.type === "shield") ||
            transactions.some((t) => t.type === "transfer")),
        testnetOnly: true,
      },
      {
        id: "shield",
        label: "Shield tokens",
        description: "Move public stablecoins into the encrypted pool. This step is visible on-chain.",
        to: "/dashboard/shield",
        done: hasShieldedNote,
      },
      {
        id: "transfer",
        label: "Send privately",
        description: "Transfer shielded value with a zero-knowledge proof via the relayer.",
        to: "/dashboard/transfer",
        done: hasPrivateTransfer,
      },
    ];

    return isTestnet ? all : all.filter((s) => !s.testnetOnly);
  }, [wallet, hasKeys, notes, transactions, isTestnet]);

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const currentStep = steps.find((s) => !s.done) ?? steps[steps.length - 1];
  const shouldShow = !dismissed && !allDone;

  return {
    steps,
    completedCount,
    totalSteps: steps.length,
    allDone,
    currentStep,
    shouldShow,
    dismissed,
  };
}
