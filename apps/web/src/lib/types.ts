export type Hex32 = `0x${string}`;
export type NetworkName = "local" | "futurenet" | "testnet" | "mainnet";

export type DeploymentAddresses = {
  verifier: string;
  merkleTree: string;
  shieldedPool: string;
  network?: string;
  /** Ledger the shielded pool contract was deployed at — scan start hint. */
  deployLedger?: number;
  /** When true, pool emits (route, channel, subchannel) indexed events for O(your notes) RPC scans. */
  indexedRouteEvents?: boolean;
  /** Stablecoin contract IDs keyed by ticker (USDC, EURC, YLDS, MGUSD). */
  tokens: Partial<Record<"USDC" | "EURC" | "YLDS" | "MGUSD", string>>;
};

export type NetworkConfig = {
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl?: string;
  friendbotUrl?: string;
  contracts: DeploymentAddresses;
};

export type DecryptedNote = {
  id: string;
  commitment: Hex32;
  token: Hex32;
  amount: bigint;
  blinding: bigint;
  leafIndex?: number;
  txHash?: string;
  spent?: boolean;
  nullifier?: Hex32;
  createdAt?: string;
};

export type TransactionRecord = {
  id: string;
  type: "shield" | "transfer" | "unshield";
  status: "pending" | "confirmed" | "failed";
  amount: string;
  txHash?: string;
  createdAt: string;
  detail?: string;
};

export type ShieldedKeys = {
  spendingKey: bigint;
  viewingPriv: bigint;
  viewingPub: Hex32;
  ownerPk: Hex32;
};

export const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const TREE_DEPTH = 20;

export const RELAYER_URL =
  (import.meta.env.VITE_RELAYER_URL as string | undefined)?.trim() || "http://127.0.0.1:8787";
