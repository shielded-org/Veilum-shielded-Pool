import { Address, nativeToScVal, xdr, rpc } from "@stellar/stellar-sdk";

const { Server: SorobanRpc } = rpc;

import { routeForRecipient } from "./keys";
import { clampScanLedger, pickEventsRpc, type RpcLedgerWindow } from "./rpc-events";
import { scanDebug } from "./scan-debug";
import type { Hex32, NetworkConfig } from "./types";
import { bytes32Arg } from "./utils";

/** Base64 ScVal XDR for Soroban symbol `route` — used in getEvents topic filters. */
export const ROUTE_EVENT_TOPIC = nativeToScVal("route", { type: "symbol" }).toXDR("base64");

export function bytes32TopicXdr(hex: Hex32 | string): string {
  const bytes = Buffer.from(bytes32Arg(hex), "hex");
  return xdr.ScVal.scvBytes(bytes).toXDR("base64");
}

/** Contract-only filter — Soroban RPC topic filters are unreliable; match topics client-side. */
export function poolContractEventFilter(poolId: string) {
  return {
    type: "contract" as const,
    contractIds: [poolId],
  };
}

/** @deprecated RPC topic filters return empty on testnet — use poolContractEventFilter */
export function indexedRouteEventFilter(poolId: string, viewingPub: Hex32, subchannelId: number) {
  const route = routeForRecipient(viewingPub, subchannelId);
  return {
    type: "contract" as const,
    contractIds: [poolId],
    topics: [
      [ROUTE_EVENT_TOPIC],
      [bytes32TopicXdr(route.channel)],
      [bytes32TopicXdr(route.subchannel)],
    ],
  };
}

/** @deprecated RPC topic filters return empty on testnet — use poolContractEventFilter */
export function legacyRouteEventFilter(poolId: string) {
  return {
    type: "contract" as const,
    contractIds: [poolId],
    topics: [[ROUTE_EVENT_TOPIC]],
  };
}

/** Resolve the ledger to begin scanning pool route events from. */
export async function resolvePoolStartLedger(
  config: NetworkConfig,
  poolId: string,
  deployLedger?: number
): Promise<{ startLedger: number; window: RpcLedgerWindow; eventsRpc: SorobanRpc }> {
  const { rpc: eventsRpc, window } = await pickEventsRpc(config, poolId, deployLedger, { force: true });
  const instanceLedger = await fetchContractInstanceLedger(eventsRpc, poolId);

  // Start at deploy ledger (minus buffer), clamped to RPC retention — same as shielded-token poolDeployBlock.
  let desired =
    deployLedger && deployLedger > 0
      ? deployLedger - 50
      : instanceLedger && instanceLedger > 0
        ? instanceLedger - 50
        : window.oldest;

  if (instanceLedger && instanceLedger > 0 && (!deployLedger || deployLedger <= 0)) {
    desired = Math.min(desired, instanceLedger - 50);
  }

  const startLedger = clampScanLedger(desired, window);

  scanDebug("resolvePoolStartLedger", {
    poolId,
    deployLedger: deployLedger ?? null,
    instanceLedger,
    rpcOldest: window.oldest,
    rpcLatest: window.latest,
    rpcUrl: window.rpcUrl,
    desiredStart: desired,
    clampedStart: startLedger,
  });

  return { startLedger, window, eventsRpc };
}

async function fetchContractInstanceLedger(
  rpcClient: SorobanRpc,
  poolId: string
): Promise<number | null> {
  try {
    const addr = Address.fromString(poolId);
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: addr.toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );
    const ent = await rpcClient.getLedgerEntries(key);
    const seq = ent.entries?.[0]?.lastModifiedLedgerSeq;
    return typeof seq === "number" ? seq : null;
  } catch {
    return null;
  }
}

/** Subchannel indices to scan — must include every subchannel used (0 … routeCursor). */
export function subchannelScanWindow(routeCursor: number): number[] {
  const count = Math.max(routeCursor + 1, routeCursor + 8, 12);
  return Array.from({ length: count }, (_, i) => i);
}
