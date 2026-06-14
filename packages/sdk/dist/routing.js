import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes, } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3";
import { toHex32 } from "./hash.js";
const HKDF_INFO = "zkproject-note-v1";
function hexToBytes(hex) {
    return Buffer.from(hex.replace(/^0x/, ""), "hex");
}
function bytesToHex(bytes) {
    return `0x${Buffer.from(bytes).toString("hex")}`;
}
function keccak256(data) {
    return bytesToHex(keccak_256(data));
}
export function viewingPrivToPub(viewingPriv) {
    const ecdh = createECDH("secp256k1");
    ecdh.setPrivateKey(hexToBytes(toHex32(viewingPriv)));
    return bytesToHex(ecdh.getPublicKey(undefined, "compressed"));
}
/** channel = keccak256(viewingPub); subchannel = keccak256(channel || uint64_be(subchannelId)). */
export function routeForRecipient(viewingPubHex, subchannelId) {
    const channel = keccak256(hexToBytes(viewingPubHex));
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64BE(BigInt(subchannelId));
    const subchannel = keccak256(Buffer.concat([hexToBytes(channel), idBuf]));
    return { channel, subchannel };
}
/** ECDH + HKDF + AES-256-GCM note envelope (UTF-8 JSON), returned as hex bytes for Soroban `Bytes`. */
export function encryptNoteECDH(note, recipientViewingPubHex) {
    const eph = createECDH("secp256k1");
    eph.generateKeys();
    const sharedSecret = eph.computeSecret(hexToBytes(recipientViewingPubHex));
    const salt = randomBytes(32);
    const key = Buffer.from(hkdfSync("sha256", sharedSecret, salt, Buffer.from(HKDF_INFO), 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = Buffer.from(JSON.stringify(note), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = {
        v: 1,
        eph: bytesToHex(eph.getPublicKey(undefined, "compressed")),
        salt: bytesToHex(salt),
        iv: bytesToHex(iv),
        ct: bytesToHex(ciphertext),
        tag: bytesToHex(tag),
    };
    return bytesToHex(Buffer.from(JSON.stringify(envelope), "utf8"));
}
export function decryptNoteECDH(encryptedNoteHex, recipientViewingPriv) {
    try {
        const envelopeRaw = Buffer.from(encryptedNoteHex.replace(/^0x/, ""), "hex").toString("utf8");
        const envelope = JSON.parse(envelopeRaw);
        if (envelope.v !== 1)
            return null;
        const recipientECDH = createECDH("secp256k1");
        recipientECDH.setPrivateKey(hexToBytes(toHex32(recipientViewingPriv)));
        const sharedSecret = recipientECDH.computeSecret(hexToBytes(envelope.eph));
        const key = Buffer.from(hkdfSync("sha256", sharedSecret, hexToBytes(envelope.salt), Buffer.from(HKDF_INFO), 32));
        const decipher = createDecipheriv("aes-256-gcm", key, hexToBytes(envelope.iv));
        decipher.setAuthTag(hexToBytes(envelope.tag));
        const plaintext = Buffer.concat([decipher.update(hexToBytes(envelope.ct)), decipher.final()]);
        return JSON.parse(plaintext.toString("utf8"));
    }
    catch {
        return null;
    }
}
/** Stellar event topic-style fingerprint for logs (sha256 of label). */
export function hashLabel(label) {
    return createHash("sha256").update(label).digest();
}
