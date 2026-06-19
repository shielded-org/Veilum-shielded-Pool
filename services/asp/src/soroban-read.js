import { execFileSync } from "node:child_process";

import { Contract, rpc, scValToNative, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

const { Api } = rpc;

function bytes32ScVal(hex) {
  const buf = Buffer.from(hex.replace(/^0x/, "").padStart(64, "0").slice(-64), "hex");
  return xdr.ScVal.scvBytes(buf);
}

export function createAspSorobanReader({
  networkPassphrase,
  primaryRpcUrl,
  fallbackRpcUrls = [],
  sourceAccount,
  contractId,
}) {
  const rpcUrls = [
    primaryRpcUrl,
    ...fallbackRpcUrls,
    ...(process.env.STELLAR_RPC_URLS?.split(",").map((u) => u.trim()) ?? []),
  ].filter(Boolean);

  const uniqueRpcUrls = [...new Set(rpcUrls)];

  let sourceAddress = process.env.ASP_SOURCE_ADDRESS || null;
  if (!sourceAddress) {
    if (sourceAccount.startsWith("G")) {
      sourceAddress = sourceAccount;
    } else {
      sourceAddress = execFileSync("stellar", ["keys", "address", sourceAccount], {
        encoding: "utf8",
      }).trim();
    }
  }

  async function simulateRead(fn, scArgs) {
    let lastError = null;
    for (const rpcUrl of uniqueRpcUrls) {
      try {
        const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
        const account = await server.getAccount(sourceAddress);
        const contract = new Contract(contractId);
        const tx = new TransactionBuilder(account, {
          fee: "10000",
          networkPassphrase,
        })
          .addOperation(contract.call(fn, ...scArgs))
          .setTimeout(180)
          .build();
        const sim = await server.simulateTransaction(tx);
        if (Api.isSimulationError(sim)) {
          throw new Error(typeof sim.error === "string" ? sim.error : "simulation failed");
        }
        if (Api.isSimulationRestore(sim)) {
          throw new Error("contract needs restore");
        }
        return scValToNative(sim.result?.retval);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("no RPC URLs configured");
  }

  return {
    async isKnownRoot(rootHex) {
      return Boolean(await simulateRead("is_known_root", [bytes32ScVal(rootHex)]));
    },
    async getLastRoot() {
      const buf = await simulateRead("get_last_root", []);
      const hex = Buffer.from(buf).toString("hex").padStart(64, "0").slice(-64);
      return `0x${hex}`;
    },
  };
}
