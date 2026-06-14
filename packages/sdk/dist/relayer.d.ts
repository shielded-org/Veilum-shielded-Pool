export type StellarShieldedTransferPayload = {
    network?: string;
    shieldedPool: string;
    proofBytes: string;
    transferMeta: string;
    encryptedNote0: string;
    encryptedNote1: string;
    channel0: string;
    channel1: string;
    subchannel0: string;
    subchannel1: string;
    fee?: string | number;
};
export type RelayerResponse = {
    accepted?: boolean;
    requestId: string;
    txHash?: string | null;
    status: string;
    error?: string;
    createdAt?: string;
};
export type StellarUnshieldPayload = {
    network?: string;
    shieldedPool: string;
    proofBytes: string;
    nullifier: string;
    token: string;
    recipient: string;
    amount: string | number;
    merkleRoot: string;
    newCommitment: string;
    encryptedNote?: string;
    channel?: string;
    subchannel?: string;
};
export declare function submitUnshieldToRelayer(relayerUrl: string, payload: StellarUnshieldPayload): Promise<RelayerResponse>;
export declare function submitShieldedTransferToRelayer(relayerUrl: string, payload: StellarShieldedTransferPayload): Promise<RelayerResponse>;
export declare function fetchRelayerStatus(relayerUrl: string, requestId: string): Promise<RelayerResponse>;
export declare function waitForRelayerConfirmation(relayerUrl: string, requestId: string, timeoutMs?: number, pollMs?: number): Promise<RelayerResponse>;
