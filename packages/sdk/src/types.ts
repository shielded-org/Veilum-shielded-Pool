export const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const TREE_DEPTH = 20;
export const PUBLIC_INPUT_COUNT = 12;
export const PUBLIC_INPUT_COUNT_ASP = 14;
export const PROOF_BYTES = 456 * 32;

export type Hex32 = `0x${string}`;

export type ShieldedNote = {
  ownerPk: Hex32;
  token: Hex32;
  amount: string;
  blinding: Hex32;
  commitment: Hex32;
};

export type NetworkName = "local" | "futurenet" | "testnet" | "mainnet";

export type DeploymentAddresses = {
  verifier?: string;
  merkleTree?: string;
  shieldedPool?: string;
  /** @deprecated use shieldedPool */
  shieldedToken?: string;
  deployLedger?: number;
  indexedRouteEvents?: boolean;
  tokens?: Partial<Record<"USDC" | "EURC" | "YLDS" | "MGUSD", string>>;
  aspMembership?: string;
  aspDeny?: string;
  verifierAsp?: string;
  aspGate?: string;
  aspEnforceShield?: boolean;
};

export type NetworkConfig = {
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  friendbotUrl?: string;
  sourceAccount: string;
  containerName?: string;
  contracts: DeploymentAddresses;
};
