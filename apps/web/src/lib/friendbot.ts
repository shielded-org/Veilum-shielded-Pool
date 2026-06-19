import { formatTokenAmount } from "./utils";

type FriendbotResponse = {
  successful?: boolean;
  hash?: string;
  detail?: string;
  extras?: { result_codes?: { transaction?: string } };
};

export async function fundWithFriendbot(
  friendbotUrl: string,
  address: string
): Promise<string | undefined> {
  const url = new URL(friendbotUrl);
  url.searchParams.set("addr", address);
  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => ({}))) as FriendbotResponse;

  if (!res.ok) {
    const detail =
      body.detail ||
      body.extras?.result_codes?.transaction ||
      `Friendbot request failed (${res.status})`;
    throw new Error(detail);
  }

  if (body.successful === false) {
    throw new Error(body.detail || "Friendbot could not fund this account");
  }

  return body.hash;
}

type HorizonAccount = {
  balances: Array<{ asset_type: string; balance: string }>;
};

export async function getNativeXlmBalance(
  horizonUrl: string,
  address: string
): Promise<bigint> {
  const base = horizonUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/accounts/${address}`);
  if (res.status === 404) return 0n;
  if (!res.ok) throw new Error(`Failed to load XLM balance (${res.status})`);
  const data = (await res.json()) as HorizonAccount;
  const native = data.balances.find((b) => b.asset_type === "native");
  if (!native) return 0n;
  const [whole, frac = ""] = native.balance.split(".");
  const padded = frac.padEnd(7, "0").slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(padded || "0");
}

export function formatXlmBalance(raw: bigint): string {
  return `${formatTokenAmount(raw, 7)} XLM`;
}
