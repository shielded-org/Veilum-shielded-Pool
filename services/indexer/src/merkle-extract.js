import { Address, xdr } from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

function parseEnvelope(envelopeXdr) {
  if (!envelopeXdr) return null;
  if (typeof envelopeXdr === "string") return xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  return envelopeXdr;
}

function getEnvelopeOperations(envelope) {
  switch (envelope.switch()) {
    case xdr.EnvelopeType.envelopeTypeTxV0():
      return envelope.v0().tx().operations();
    case xdr.EnvelopeType.envelopeTypeTx():
      return envelope.v1().tx().operations();
    case xdr.EnvelopeType.envelopeTypeTxFeeBump(): {
      const inner = envelope.feeBump().tx().innerTx();
      const innerEnv = parseEnvelope(typeof inner.value === "function" ? inner.value() : inner);
      return innerEnv ? getEnvelopeOperations(innerEnv) : [];
    }
    default:
      return [];
  }
}

function scValBytesToHex32(val) {
  if (val.switch() !== xdr.ScValType.scvBytes()) return null;
  const hex = Buffer.from(val.bytes()).toString("hex").padStart(64, "0").slice(-64);
  return `0x${hex}`;
}

function scValBytesToHex(val) {
  if (val.switch() !== xdr.ScValType.scvBytes()) return "";
  return Buffer.from(val.bytes()).toString("hex");
}

/** Extract merkle leaf commitments inserted by a pool (or ASP gate) transaction. */
export function extractMerkleLeavesFromEnvelope(envelopeXdr, poolId, aspGateId) {
  const out = [];
  const envelope = parseEnvelope(envelopeXdr);
  if (!envelope) return out;

  for (const op of getEnvelopeOperations(envelope)) {
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) continue;
    const invoke = op.body().invokeHostFunctionOp();
    const host = invoke.hostFunction();
    if (host.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) continue;
    const invokeContract = host.invokeContract();
    const contract = Address.fromScAddress(invokeContract.contractAddress()).toString();
    const fn = invokeContract.functionName().toString();
    const args = invokeContract.args();

    if (contract === poolId) {
      if (fn === "shield_routed" && args.length >= 4) {
        const c = scValBytesToHex32(args[3]);
        if (c) out.push(c);
      } else if (fn === "shielded_transfer_routed" && args.length >= 2) {
        const meta = scValBytesToHex(args[1]);
        if (meta.length >= 256) {
          out.push(`0x${meta.slice(128, 192)}`, `0x${meta.slice(192, 256)}`);
        }
      } else if (
        (fn === "unshield" || fn === "unshield_with_asp" || fn === "fulfill_unshield") &&
        args.length >= 7
      ) {
        const c = scValBytesToHex32(args[6]);
        if (c && c !== `0x${"00".repeat(32)}`) out.push(c);
      }
    } else if (aspGateId && contract === aspGateId && fn === "unshield_asp" && args.length >= 2) {
      const meta = scValBytesToHex(args[1]);
      if (meta.length >= 192) {
        const c = `0x${meta.slice(128, 192)}`;
        if (c !== `0x${"00".repeat(32)}`) out.push(c);
      }
    }
  }

  return out;
}

async function fetchHorizonEnvelope(horizonUrl, txHash) {
  const base = horizonUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/transactions/${txHash}`);
  if (!res.ok) return null;
  const body = await res.json();
  return body.envelope_xdr ?? null;
}

/** Fetch tx envelope via Soroban RPC, falling back to Horizon for archived ledgers. */
export async function fetchTxEnvelope(rpcUrls, horizonUrl, txHash) {
  for (const url of rpcUrls) {
    try {
      const client = new SorobanRpc(url, { allowHttp: url.startsWith("http://") });
      const tx = await client.getTransaction(txHash);
      if (tx.status !== Api.GetTransactionStatus.NOT_FOUND && tx.envelopeXdr) {
        const xdrStr =
          typeof tx.envelopeXdr === "string" ? tx.envelopeXdr : tx.envelopeXdr.toXDR("base64");
        return { envelopeXdr: xdrStr, status: tx.status };
      }
    } catch {
      /* next */
    }
  }
  if (!horizonUrl) return null;
  const envelopeXdr = await fetchHorizonEnvelope(horizonUrl, txHash);
  if (!envelopeXdr) return null;
  return { envelopeXdr, status: Api.GetTransactionStatus.SUCCESS };
}
