import { nativeToScVal } from "@stellar/stellar-base";
import { Contract, Keypair, rpc, TransactionBuilder, xdr, scValToNative } from "@stellar/stellar-sdk";

const { Api, assembleTransaction } = rpc;

function isRetryableRpcError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|502|504|429|Networking|protocol error|fetch failed|ECONNRESET|ETIMEDOUT|temporarily unavailable/i.test(
    msg
  );
}

export function bytes32ScVal(hex) {
  const buf = Buffer.from(hex.replace(/^0x/, "").padStart(64, "0").slice(-64), "hex");
  return xdr.ScVal.scvBytes(buf);
}

export function createSorobanSubmitter({
  secretKey,
  networkPassphrase,
  primaryRpcUrl,
  fallbackRpcUrls = [],
}) {
  if (!secretKey) {
    throw new Error("ASP_SECRET_KEY required for Soroban submission");
  }
  const keypair = Keypair.fromSecret(secretKey);
  const rpcUrls = [primaryRpcUrl, ...fallbackRpcUrls].filter(Boolean);
  const uniqueRpcUrls = [...new Set(rpcUrls)];

  async function withRpc(fn) {
    let lastError = null;
    for (const rpcUrl of uniqueRpcUrls) {
      try {
        const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
        return await fn(server);
      } catch (error) {
        lastError = error;
        if (!isRetryableRpcError(error)) throw error;
      }
    }
    throw lastError ?? new Error("no RPC URLs configured");
  }

  async function simulateContractInvoke(contractId, method, scArgs) {
    return withRpc(async (server) => {
      const account = await server.getAccount(keypair.publicKey());
      const contract = new Contract(contractId);
      const tx = new TransactionBuilder(account, {
        fee: "10000000",
        networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(180)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (Api.isSimulationError(sim)) {
        const detail =
          typeof sim.error === "string" ? sim.error : JSON.stringify(sim.error ?? sim);
        throw new Error(`Simulation failed: ${detail}`);
      }
      if (Api.isSimulationRestore(sim)) {
        throw new Error("Contract requires state restore — fund ASP source account");
      }
      return scValToNative(sim.result?.retval);
    });
  }

  async function submitContractInvoke(contractId, method, scArgs) {
    return withRpc(async (server) => {
      const account = await server.getAccount(keypair.publicKey());
      const contract = new Contract(contractId);
      let tx = new TransactionBuilder(account, {
        fee: "10000000",
        networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(180)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (Api.isSimulationError(sim)) {
        const detail =
          typeof sim.error === "string" ? sim.error : JSON.stringify(sim.error ?? sim);
        throw new Error(`Simulation failed: ${detail}`);
      }
      if (Api.isSimulationRestore(sim)) {
        throw new Error("Contract requires state restore — fund ASP source account");
      }

      tx = assembleTransaction(tx, sim).build();
      tx.sign(keypair);

      const send = await server.sendTransaction(tx);
      if (send.status === "ERROR") {
        throw new Error(JSON.stringify(send));
      }
      const hash = send.hash;
      if (!hash) throw new Error("No transaction hash returned");

      const deadline = Date.now() + 180_000;
      let status = await server.getTransaction(hash);
      while (status.status === Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        status = await server.getTransaction(hash);
      }
      if (status.status === Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed on-chain: ${hash}`);
      }
      if (status.status !== Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction not confirmed on-chain: ${hash} (status=${status.status})`);
      }
      return hash;
    });
  }

  return {
    publicKey: keypair.publicKey(),
    simulateContractInvoke,
    submitContractInvoke,
    u128Arg(value) {
      return nativeToScVal(BigInt(value), { type: "u128" });
    },
  };
}
