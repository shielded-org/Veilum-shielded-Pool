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
  1: {message:"InvalidRoot"},
  2: {message:"InvalidProof"},
  3: {message:"InvalidTokenField"},
  4: {message:"InvalidToken"},
  5: {message:"InvalidRecipient"},
  6: {message:"InvalidAmount"},
  7: {message:"InvalidCommitment"},
  8: {message:"InvalidNullifier"},
  9: {message:"DuplicateNullifiers"},
  10: {message:"NullifierAlreadySpent"},
  11: {message:"VerificationFailed"},
  12: {message:"NotOwner"},
  13: {message:"TokenNotEnabled"},
  14: {message:"TokenTransferFailed"}
}

export type DataKey = {tag: "Owner", values: void} | {tag: "Verifier", values: void} | {tag: "MerkleTree", values: void} | {tag: "EnabledToken", values: readonly [string]} | {tag: "TokenFieldFor", values: readonly [string]} | {tag: "TokenByField", values: readonly [Buffer]} | {tag: "Nullifier", values: readonly [Buffer]};


export interface RoutedNote {
  channel: Buffer;
  encrypted_note: Buffer;
  subchannel: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a unshield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unshield: ({proof_bytes, nullifier, token, recipient, amount, merkle_root, new_commitment, encrypted_note, channel, subchannel}: {proof_bytes: Buffer, nullifier: Buffer, token: string, recipient: string, amount: u128, merkle_root: Buffer, new_commitment: Buffer, encrypted_note: Buffer, channel: Buffer, subchannel: Buffer}, options?: {
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
   * Construct and simulate a token_field transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_field: ({token}: {token: string}, options?: {
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
   * Construct and simulate a shield_routed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  shield_routed: ({caller, token, amount, commitment, encrypted_note, channel, subchannel}: {caller: string, token: string, amount: i128, commitment: Buffer, encrypted_note: Buffer, channel: Buffer, subchannel: Buffer}, options?: {
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
   * Construct and simulate a nullifier_spent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  nullifier_spent: ({nullifier}: {nullifier: Buffer}, options?: {
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
   * Construct and simulate a set_token_enabled transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_token_enabled: ({token, enabled}: {token: string, enabled: boolean}, options?: {
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
   * Construct and simulate a shielded_transfer_routed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  shielded_transfer_routed: ({proof_bytes, transfer_meta, encrypted_note0, encrypted_note1, channel0, channel1, subchannel0, subchannel1, fee}: {proof_bytes: Buffer, transfer_meta: Buffer, encrypted_note0: Buffer, encrypted_note1: Buffer, channel0: Buffer, channel1: Buffer, subchannel0: Buffer, subchannel1: Buffer, fee: u128}, options?: {
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

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, verifier, merkle_tree}: {owner: string, verifier: string, merkle_tree: string},
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
    return ContractClient.deploy({owner, verifier, merkle_tree}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADgAAAAAAAAALSW52YWxpZFJvb3QAAAAAAQAAAAAAAAAMSW52YWxpZFByb29mAAAAAgAAAAAAAAARSW52YWxpZFRva2VuRmllbGQAAAAAAAADAAAAAAAAAAxJbnZhbGlkVG9rZW4AAAAEAAAAAAAAABBJbnZhbGlkUmVjaXBpZW50AAAABQAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAYAAAAAAAAAEUludmFsaWRDb21taXRtZW50AAAAAAAABwAAAAAAAAAQSW52YWxpZE51bGxpZmllcgAAAAgAAAAAAAAAE0R1cGxpY2F0ZU51bGxpZmllcnMAAAAACQAAAAAAAAAVTnVsbGlmaWVyQWxyZWFkeVNwZW50AAAAAAAACgAAAAAAAAASVmVyaWZpY2F0aW9uRmFpbGVkAAAAAAALAAAAAAAAAAhOb3RPd25lcgAAAAwAAAAAAAAAD1Rva2VuTm90RW5hYmxlZAAAAAANAAAAAAAAABNUb2tlblRyYW5zZmVyRmFpbGVkAAAAAA4=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAIVmVyaWZpZXIAAAAAAAAAAAAAAApNZXJrbGVUcmVlAAAAAAABAAAAAAAAAAxFbmFibGVkVG9rZW4AAAABAAAAEwAAAAEAAAAAAAAADVRva2VuRmllbGRGb3IAAAAAAAABAAAAEwAAAAEAAAAAAAAADFRva2VuQnlGaWVsZAAAAAEAAAPuAAAAIAAAAAEAAAAAAAAACU51bGxpZmllcgAAAAAAAAEAAAPuAAAAIA==",
        "AAAAAQAAAAAAAAAAAAAAClJvdXRlZE5vdGUAAAAAAAMAAAAAAAAAB2NoYW5uZWwAAAAD7gAAACAAAAAAAAAADmVuY3J5cHRlZF9ub3RlAAAAAAAOAAAAAAAAAApzdWJjaGFubmVsAAAAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAIdW5zaGllbGQAAAAKAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAoAAAAAAAAAC21lcmtsZV9yb290AAAAA+4AAAAgAAAAAAAAAA5uZXdfY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAADmVuY3J5cHRlZF9ub3RlAAAAAAAOAAAAAAAAAAdjaGFubmVsAAAAA+4AAAAgAAAAAAAAAApzdWJjaGFubmVsAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALdG9rZW5fZmllbGQAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAAAttZXJrbGVfdHJlZQAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANc2hpZWxkX3JvdXRlZAAAAAAAAAcAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAA5lbmNyeXB0ZWRfbm90ZQAAAAAADgAAAAAAAAAHY2hhbm5lbAAAAAPuAAAAIAAAAAAAAAAKc3ViY2hhbm5lbAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAPbnVsbGlmaWVyX3NwZW50AAAAAAEAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAARc2V0X3Rva2VuX2VuYWJsZWQAAAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAYc2hpZWxkZWRfdHJhbnNmZXJfcm91dGVkAAAACQAAAAAAAAALcHJvb2ZfYnl0ZXMAAAAADgAAAAAAAAANdHJhbnNmZXJfbWV0YQAAAAAAAA4AAAAAAAAAD2VuY3J5cHRlZF9ub3RlMAAAAAAOAAAAAAAAAA9lbmNyeXB0ZWRfbm90ZTEAAAAADgAAAAAAAAAIY2hhbm5lbDAAAAPuAAAAIAAAAAAAAAAIY2hhbm5lbDEAAAPuAAAAIAAAAAAAAAALc3ViY2hhbm5lbDAAAAAD7gAAACAAAAAAAAAAC3N1YmNoYW5uZWwxAAAAA+4AAAAgAAAAAAAAAANmZWUAAAAACgAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    unshield: this.txFromJSON<Result<void>>,
        token_field: this.txFromJSON<Buffer>,
        shield_routed: this.txFromJSON<Result<void>>,
        nullifier_spent: this.txFromJSON<boolean>,
        set_token_enabled: this.txFromJSON<Result<void>>,
        shielded_transfer_routed: this.txFromJSON<Result<void>>
  }
}