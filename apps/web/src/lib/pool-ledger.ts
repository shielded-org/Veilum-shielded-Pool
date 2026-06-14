import { Address, nativeToScVal, xdr, rpc } from "@stellar/stellar-sdk";

const { Server: SorobanRpc } = rpc;

import { routeForRecipient } from "./keys";
import type { Hex32 } from "./types";
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
  rpcClient: SorobanRpc,
  poolId: string,
  deployLedger?: number
): Promise<number> {
  if (deployLedger && deployLedger > 0) {
    return Math.max(deployLedger - 50, 1);
  }

  const latest = await rpcClient.getLatestLedger();
  const probeStart = Math.max(latest.sequence - 5000, 1);
  const probe = await rpcClient.getEvents({
    startLedger: probeStart,
    filters: [poolContractEventFilter(poolId)],
    limit: 1,
  });
  const oldest = probe.oldestLedger;

  const instanceLedger = await fetchContractInstanceLedger(rpcClient, poolId);
  if (instanceLedger) {
    return Math.max(instanceLedger - 50, oldest);
  }

  return oldest;
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

/** Subchannel indices to scan in parallel (matches shielded-token route cursor window). */
export function subchannelScanWindow(routeCursor: number): number[] {
  const count = Math.max(routeCursor + 8, 12);
  return Array.from({ length: count }, (_, i) => i);
}
