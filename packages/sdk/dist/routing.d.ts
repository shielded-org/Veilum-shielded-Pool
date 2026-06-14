export type ViewingRoute = {
    channel: `0x${string}`;
    subchannel: `0x${string}`;
};
export type EncryptedNoteEnvelope = {
    v: 1;
    eph: `0x${string}`;
    salt: `0x${string}`;
    iv: `0x${string}`;
    ct: `0x${string}`;
    tag: `0x${string}`;
};
export declare function viewingPrivToPub(viewingPriv: bigint): `0x${string}`;
/** channel = keccak256(viewingPub); subchannel = keccak256(channel || uint64_be(subchannelId)). */
export declare function routeForRecipient(viewingPubHex: `0x${string}`, subchannelId: number | bigint): ViewingRoute;
export type NotePlaintext = {
    token: string;
    amount: string;
    blinding: string;
    commitment: string;
    owner_pk?: string;
};
/** ECDH + HKDF + AES-256-GCM note envelope (UTF-8 JSON), returned as hex bytes for Soroban `Bytes`. */
export declare function encryptNoteECDH(note: NotePlaintext, recipientViewingPubHex: `0x${string}`): `0x${string}`;
export declare function decryptNoteECDH(encryptedNoteHex: string, recipientViewingPriv: bigint): NotePlaintext | null;
/** Stellar event topic-style fingerprint for logs (sha256 of label). */
export declare function hashLabel(label: string): Buffer;
