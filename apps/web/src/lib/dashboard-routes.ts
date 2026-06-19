import type { ComponentType } from "react";

import {
  IconArrowRightCircle,
  IconDroplet,
  IconHome,
  IconKey,
  IconList,
  IconUploadCloud,
  IconDownloadCloud,
} from "../components/ui/icons";

type IconProps = { size?: number; className?: string };

export type DashboardNavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: ComponentType<IconProps>;
  testnetOnly?: boolean;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

export type DashboardPageMeta = {
  title: string;
  description: string;
};

export const DASHBOARD_PAGE_META: Record<string, DashboardPageMeta> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Shielded balances, notes, and recent activity",
  },
  "/dashboard/shield": {
    title: "Shield",
    description: "Deposit public stablecoins into the encrypted pool",
  },
  "/dashboard/faucet": {
    title: "Faucet",
    description: "Mint testnet stablecoins to your wallet",
  },
  "/dashboard/transfer": {
    title: "Transfer",
    description: "Send shielded value privately with zero-knowledge proofs",
  },
  "/dashboard/unshield": {
    title: "Withdraw",
    description: "Exit shielded balance to a public Stellar address",
  },
  "/dashboard/notes": {
    title: "Notes",
    description: "Shielded notes discovered from on-chain route events",
  },
  "/dashboard/keys": {
    title: "Keys",
    description: "Receive address and key material for private payments",
  },
  "/dashboard/asp": {
    title: "ASP Admin",
    description: "Approve or deny Association Set membership",
  },
};

export function dashboardNavGroups(isTestnet: boolean): DashboardNavGroup[] {
  const groups: DashboardNavGroup[] = [
    {
      label: "Overview",
      items: [{ to: "/dashboard", end: true, label: "Dashboard", icon: IconHome }],
    },
    {
      label: "Actions",
      items: [
        { to: "/dashboard/shield", label: "Shield", icon: IconUploadCloud },
        { to: "/dashboard/transfer", label: "Transfer", icon: IconArrowRightCircle },
        { to: "/dashboard/unshield", label: "Withdraw", icon: IconDownloadCloud },
      ],
    },
  ];

  if (isTestnet) {
  groups.push({
    label: "Testnet",
    items: [
      { to: "/dashboard/faucet", label: "Faucet", icon: IconDroplet, testnetOnly: true },
    ],
  });
  }

  groups.push({
    label: "Wallet",
    items: [
      { to: "/dashboard/notes", label: "Notes", icon: IconList },
      { to: "/dashboard/keys", label: "Keys", icon: IconKey },
    ],
  });

  return groups;
}
