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
  1: {message:"TreeFull"},
  2: {message:"NotOwner"},
  3: {message:"InvalidPath"},
  4: {message:"InvalidSiblings"}
}

export type DataKey = {tag: "Owner", values: void} | {tag: "CurrentRoot", values: void} | {tag: "RootHistory", values: readonly [u32]} | {tag: "RootPointer", values: void} | {tag: "KnownRoot", values: readonly [Buffer]} | {tag: "Zeros", values: readonly [u32]} | {tag: "FilledSubtrees", values: readonly [u32]} | {tag: "NextIndex", values: void} | {tag: "LeafOwner", values: readonly [u32]};

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
   * Construct and simulate a hash3 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  hash3: ({a, b, c}: {a: Buffer, b: Buffer, c: Buffer}, options?: {
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
   * Construct and simulate a set_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_owner: ({new_owner}: {new_owner: string}, options?: {
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
   * Construct and simulate a verify_path transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_path: ({owner_pk, membership_blinding, leaf_index, siblings, root}: {owner_pk: Buffer, membership_blinding: Buffer, leaf_index: u32, siblings: Array<Buffer>, root: Buffer}, options?: {
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
   * Construct and simulate a insert_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  insert_member: ({owner_pk, membership_blinding}: {owner_pk: Buffer, membership_blinding: Buffer}, options?: {
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
  }) => Promise<AssembledTransaction<Result<u32>>>

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

  /**
   * Construct and simulate a membership_leaf transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  membership_leaf: ({owner_pk, membership_blinding}: {owner_pk: Buffer, membership_blinding: Buffer}, options?: {
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

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner}: {owner: string},
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
    return ContractClient.deploy({owner}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAIVHJlZUZ1bGwAAAABAAAAAAAAAAhOb3RPd25lcgAAAAIAAAAAAAAAC0ludmFsaWRQYXRoAAAAAAMAAAAAAAAAD0ludmFsaWRTaWJsaW5ncwAAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAALQ3VycmVudFJvb3QAAAAAAQAAAAAAAAALUm9vdEhpc3RvcnkAAAAAAQAAAAQAAAAAAAAAAAAAAAtSb290UG9pbnRlcgAAAAABAAAAAAAAAAlLbm93blJvb3QAAAAAAAABAAAD7gAAACAAAAABAAAAAAAAAAVaZXJvcwAAAAAAAAEAAAAEAAAAAQAAAAAAAAAORmlsbGVkU3VidHJlZXMAAAAAAAEAAAAEAAAAAAAAAAAAAAAJTmV4dEluZGV4AAAAAAAAAQAAAAAAAAAJTGVhZk93bmVyAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAFaGFzaDIAAAAAAAACAAAAAAAAAARsZWZ0AAAD7gAAACAAAAAAAAAABXJpZ2h0AAAAAAAD7gAAACAAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAFaGFzaDMAAAAAAAADAAAAAAAAAAFhAAAAAAAD7gAAACAAAAAAAAAAAWIAAAAAAAPuAAAAIAAAAAAAAAABYwAAAAAAA+4AAAAgAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAGaW5zZXJ0AAAAAAABAAAAAAAAAARsZWFmAAAD7gAAACAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAJc2V0X293bmVyAAAAAAAAAQAAAAAAAAAJbmV3X293bmVyAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALdmVyaWZ5X3BhdGgAAAAABQAAAAAAAAAIb3duZXJfcGsAAAPuAAAAIAAAAAAAAAATbWVtYmVyc2hpcF9ibGluZGluZwAAAAPuAAAAIAAAAAAAAAAKbGVhZl9pbmRleAAAAAAABAAAAAAAAAAIc2libGluZ3MAAAPqAAAD7gAAACAAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANZ2V0X2xhc3Rfcm9vdAAAAAAAAAAAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAANaW5zZXJ0X21lbWJlcgAAAAAAAAIAAAAAAAAACG93bmVyX3BrAAAD7gAAACAAAAAAAAAAE21lbWJlcnNoaXBfYmxpbmRpbmcAAAAD7gAAACAAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAAAAAAANaXNfa25vd25fcm9vdAAAAAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAOZ2V0X25leHRfaW5kZXgAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAPbWVtYmVyc2hpcF9sZWFmAAAAAAIAAAAAAAAACG93bmVyX3BrAAAD7gAAACAAAAAAAAAAE21lbWJlcnNoaXBfYmxpbmRpbmcAAAAD7gAAACAAAAABAAAD7gAAACA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    hash2: this.txFromJSON<Buffer>,
        hash3: this.txFromJSON<Buffer>,
        insert: this.txFromJSON<u32>,
        set_owner: this.txFromJSON<Result<void>>,
        verify_path: this.txFromJSON<boolean>,
        get_last_root: this.txFromJSON<Buffer>,
        insert_member: this.txFromJSON<Result<u32>>,
        is_known_root: this.txFromJSON<boolean>,
        get_next_index: this.txFromJSON<u32>,
        membership_leaf: this.txFromJSON<Buffer>
  }
}