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
  1: {message:"TreeFull"}
}

export type DataKey = {tag: "CurrentRoot", values: void} | {tag: "RootHistory", values: readonly [u32]} | {tag: "RootPointer", values: void} | {tag: "KnownRoot", values: readonly [Buffer]} | {tag: "Zeros", values: readonly [u32]} | {tag: "FilledSubtrees", values: readonly [u32]} | {tag: "NextIndex", values: void};

export interface Client {
  /**
   * Construct and simulate a hash2 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  hash2: ({left, right}: {left: Buffer, right: Buffer}, options?: {
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
  }) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a insert transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  insert: ({leaf}: {leaf: Buffer}, options?: {
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
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_last_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_last_root: (options?: {
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
  }) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a is_known_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_known_root: ({root}: {root: Buffer}, options?: {
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
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_next_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_next_index: (options?: {
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
  }) => Promise<AssembledTransaction<u32>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAQAAAAAAAAAIVHJlZUZ1bGwAAAAB",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAAC0N1cnJlbnRSb290AAAAAAEAAAAAAAAAC1Jvb3RIaXN0b3J5AAAAAAEAAAAEAAAAAAAAAAAAAAALUm9vdFBvaW50ZXIAAAAAAQAAAAAAAAAJS25vd25Sb290AAAAAAAAAQAAA+4AAAAgAAAAAQAAAAAAAAAFWmVyb3MAAAAAAAABAAAABAAAAAEAAAAAAAAADkZpbGxlZFN1YnRyZWVzAAAAAAABAAAABAAAAAAAAAAAAAAACU5leHRJbmRleAAAAA==",
        "AAAAAAAAAAAAAAAFaGFzaDIAAAAAAAACAAAAAAAAAARsZWZ0AAAD7gAAACAAAAAAAAAABXJpZ2h0AAAAAAAD7gAAACAAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAGaW5zZXJ0AAAAAAABAAAAAAAAAARsZWFmAAAD7gAAACAAAAABAAAABA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAANZ2V0X2xhc3Rfcm9vdAAAAAAAAAAAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAANaXNfa25vd25fcm9vdAAAAAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAOZ2V0X25leHRfaW5kZXgAAAAAAAAAAAABAAAABA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    hash2: this.txFromJSON<Buffer>,
        insert: this.txFromJSON<u32>,
        get_last_root: this.txFromJSON<Buffer>,
        is_known_root: this.txFromJSON<boolean>,
        get_next_index: this.txFromJSON<u32>
  }
}