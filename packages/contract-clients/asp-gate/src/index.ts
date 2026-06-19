import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AspMembershipInvalid"},
  2: {message:"AspDenied"},
  3: {message:"AspNotConfigured"},
  4: {message:"VerificationFailed"},
  5: {message:"PoolFailed"}
}

export type DataKey = {tag: "Owner", values: void} | {tag: "Pool", values: void} | {tag: "AspMembership", values: void} | {tag: "AspDeny", values: void} | {tag: "VerifierAsp", values: void};

export interface Client {
  /**
   * Construct and simulate a unshield_asp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Compact ASP unshield: `proof_bundle` = proof || public_inputs (14×32);
   * `meta` = nullifier || merkle_root || new_commitment || channel || subchannel || amount_be16
   * || recipient_len || recipient || token_len || token || enc_len || encrypted_note.
   */
  unshield_asp: ({proof_bundle, meta}: {proof_bundle: Buffer, meta: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify_shield_asp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_shield_asp: ({asp_meta}: {asp_meta: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, pool, asp_membership, asp_deny, verifier_asp}: {owner: string, pool: string, asp_membership: string, asp_deny: string, verifier_asp: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner, pool, asp_membership, asp_deny, verifier_asp}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAUQXNwTWVtYmVyc2hpcEludmFsaWQAAAABAAAAAAAAAAlBc3BEZW5pZWQAAAAAAAACAAAAAAAAABBBc3BOb3RDb25maWd1cmVkAAAAAwAAAAAAAAASVmVyaWZpY2F0aW9uRmFpbGVkAAAAAAAEAAAAAAAAAApQb29sRmFpbGVkAAAAAAAF",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAEUG9vbAAAAAAAAAAAAAAADUFzcE1lbWJlcnNoaXAAAAAAAAAAAAAAAAAAAAdBc3BEZW55AAAAAAAAAAAAAAAAC1ZlcmlmaWVyQXNwAA==",
        "AAAAAAAAAPVDb21wYWN0IEFTUCB1bnNoaWVsZDogYHByb29mX2J1bmRsZWAgPSBwcm9vZiB8fCBwdWJsaWNfaW5wdXRzICgxNMOXMzIpOwpgbWV0YWAgPSBudWxsaWZpZXIgfHwgbWVya2xlX3Jvb3QgfHwgbmV3X2NvbW1pdG1lbnQgfHwgY2hhbm5lbCB8fCBzdWJjaGFubmVsIHx8IGFtb3VudF9iZTE2Cnx8IHJlY2lwaWVudF9sZW4gfHwgcmVjaXBpZW50IHx8IHRva2VuX2xlbiB8fCB0b2tlbiB8fCBlbmNfbGVuIHx8IGVuY3J5cHRlZF9ub3RlLgAAAAAAAAx1bnNoaWVsZF9hc3AAAAACAAAAAAAAAAxwcm9vZl9idW5kbGUAAAAOAAAAAAAAAARtZXRhAAAADgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAUAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAEcG9vbAAAABMAAAAAAAAADmFzcF9tZW1iZXJzaGlwAAAAAAATAAAAAAAAAAhhc3BfZGVueQAAABMAAAAAAAAADHZlcmlmaWVyX2FzcAAAABMAAAAA",
        "AAAAAAAAAAAAAAARdmVyaWZ5X3NoaWVsZF9hc3AAAAAAAAABAAAAAAAAAAhhc3BfbWV0YQAAAA4AAAABAAAD6QAAA+4AAAAgAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    unshield_asp: this.txFromJSON<Result<void>>,
        verify_shield_asp: this.txFromJSON<Result<Buffer>>
  }
}