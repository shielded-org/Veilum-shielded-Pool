# Veilum

**Veilum** is a privacy payment protocol on Stellar. It lets users shield public stablecoins into encrypted notes, send value privately to other users, and withdraw back to public Stellar accounts — with zero-knowledge proofs verified on-chain via Soroban smart contracts.

Built on Stellar Soroban, Veilum brings shielded-pool privacy to the assets and rails Stellar already excels at: fast settlement, low fees, and regulated stablecoins (USDC, EURC, and others).

---

## Why Veilum

Public blockchains make payments transparent by default. Every transfer reveals who paid whom and how much. That is fine for auditability, but it is a poor default for everyday payments, payroll, treasury operations, and any flow where counterparties should not see each other's balances or history.

Stellar already moves stable value efficiently. What it lacks is a native way to pay privately without leaving the network. Veilum fills that gap:

- **Private transfers** — recipients receive shielded notes; sender identity and amount are not revealed in the transfer transaction.
- **Multi-asset support** — one pool custodies multiple enabled Stellar tokens; each note is bound to a specific asset via a public token field.
- **On-chain verification** — spend authorization is enforced by UltraHonk zero-knowledge proofs verified inside Soroban, not by trusted intermediaries.
- **Relayer-friendly** — private sends can be submitted by a relayer so the user's wallet is not the on-chain signer, improving metadata hygiene.
- **Composable with Stellar** — shield and unshield remain standard token transfers; only the private layer uses ZK.


---

## How it works

### Lifecycle

```
Public balance  ──shield──▶  Shielded note (in Merkle tree)
                                    │
                                    ├── private transfer ──▶  Recipient note + change note
                                    │
                                    └── unshield ──▶  Public balance (recipient + amount visible)
```

| Action | On-chain visibility |
|--------|---------------------|
| **Shield (deposit)** | Visible: depositor address, token, amount |
| **Private transfer** | Visible: nullifiers, output commitments, encrypted route payload. Hidden: sender, recipient Stellar address, transfer amount |
| **Unshield (withdraw)** | Visible: recipient address, amount, nullifier, change commitment. Hidden: which prior notes funded the withdrawal |

### Notes and keys

A **shielded note** is a commitment to `(owner_pk, token, amount, blinding)` hashed with Poseidon2. Only the holder of the **spending key** can spend it; the **viewing key** lets a wallet scan encrypted route events and decrypt incoming notes.

Keys are derived locally from a one-time wallet signature — they never leave the browser.

Recipients share a **shielded address** (`shd_…`) encoding their viewing public key. Senders paste this address to route an encrypted note without knowing the recipient's Stellar account.

### Routing and discovery

Private transfers publish **routed notes**: ECDH-encrypted note plaintext tagged with `(channel, subchannel)` derived from the recipient's viewing key. Wallets scan pool events, filter by channel, decrypt owned notes, and reconcile balances against on-chain nullifier state.

A **relayer** service accepts signed proof payloads over HTTP and submits the Soroban transaction, so the sender's Stellar address does not appear as the transaction source.

---

## Architecture

```
privacy/
├── packages/
│   ├── circuits/              Noir shielded_transfer circuit (Poseidon2, depth-20 Merkle)
│   ├── note-hash/             Auxiliary Noir circuit for note commitments (hash4)
│   ├── hash2/                 Poseidon2 hash2 helper circuit
│   ├── config/                Network definitions (local | futurenet | testnet | mainnet)
│   ├── sdk/                   Poseidon hashing, key derivation, proof CLI, routing crypto
│   ├── contract-clients/      Generated TypeScript bindings for Soroban contracts
│   └── contracts/
│       ├── merkle-tree/       Incremental Poseidon2 Merkle tree (Noir-compatible)
│       ├── mock-token/        Mintable SAC-style token for devnet / E2E
│       ├── shielded-pool/     Multi-token pool: shield, transfer, unshield
│       └── rs-soroban-ultrahonk/  On-chain UltraHonk proof verifier
├── apps/web/                  Veilum dashboard (shield, transfer, unshield, notes)
├── services/relayer/          HTTP relayer for private transaction submission
└── scripts/
    ├── build-circuits.sh      Compile Noir circuits → UltraHonk VK + web artifacts
    ├── deploy-stables.mjs     Deploy USDC, EURC, YLDS, MGUSD test tokens
    ├── devnet-e2e.mjs         Full deploy + shield + private transfer E2E
    └── generate-contract-bindings.mjs
```

### Smart contracts

| Contract | Role |
|----------|------|
| **shielded-pool** | Custodies enabled tokens; `shield_routed`, `shielded_transfer_routed`, `unshield`; nullifier set; cross-contract UltraHonk `verify_proof` |
| **merkle-tree** | Incremental Poseidon2 tree, depth 20, 30-root history window, `insert` / `is_known_root` / `get_last_root` |
| **rs-soroban-ultrahonk** | Verifies UltraHonk proofs on Soroban (456 × 32 byte proofs, 12 public inputs) |
| **tokens** | Simple mint / transfer / approve SAC for local and devnet testing |

External tokens are custodied in the pool. Each enabled token maps to a BN254 **token field**: `sha256(contract_id)`, high byte cleared. The field is a public input to the circuit so notes cannot be cross-asset confused.

### Zero-knowledge circuit

The `shielded_transfer` Noir circuit proves:

- Merkle membership of input note commitment(s) against the published root
- Correct nullifier derivation: `hash2(spending_key, commitment)`
- Valid output note commitments for recipient and change
- Value conservation on transfer (`mode = 0`)
- Partial or full unshield with private change note (`mode = 1`)

**Public inputs (12 × 32 bytes):**

| Index | Transfer | Unshield |
|-------|----------|----------|
| 0 | token field | token field |
| 1 | merkle root | merkle root |
| 2–3 | nullifiers | nullifier + zero |
| 4–5 | output commitments | change commitment + zero |
| 6–7 | fee + fee recipient (zero in wallet flow) | zero |
| 8 | mode (= 0) | mode (= 1) |
| 9–11 | zero | recipient field, amount, token field |

Poseidon2 hashing matches between Noir (`dep::poseidon`), the on-chain Merkle tree (`soroban-poseidon`), and the TypeScript SDK.

### Supported assets

Veilum targets Stellar-native stablecoins. The web app and deploy scripts support:

- **USDC** — USD Coin
- **EURC** — Euro Coin
- **YLDS** — Figure YLDS
- **MGUSD** — MoneyGram USD

On devnet/testnets these are deployed as mock SAC tokens via `scripts/deploy-stables.mjs`. On mainnet, we enable real token contract addresses.

### Privacy model

**Protected in private transfers:**
- Sender Stellar address (relayer submits the tx)
- Recipient Stellar address
- Transfer amount

**Still visible on-chain:**
- Nullifiers (link spends of the same note, not identities)
- Output note commitments
- Encrypted route events (channel/subchannel clustering)
- Merkle tree shape (`FilledSubtrees`, leaf count)
- Shield and unshield metadata (by design — deposit and exit are public)

Veilum provides **transaction privacy**, not full anonymity. Advanced adversaries may correlate timing, relayer activity, and nullifier graphs.

---

## Quickstart

### Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`)
- [Nargo](https://noir-lang.org) **1.0.0-beta.9** + [Barretenberg](https://github.com/AztecProtocol/aztec-packages) `bb` **v0.87.0** (`--oracle_hash keccak`)
- Rust + `wasm32v1-none` target
- Node.js 20+

### Build and E2E (Futurenet)

```bash
cd privacy
npm install
npm run build:sdk
npm run build:circuits
npm run build:contracts
STELLAR_NETWORK=futurenet npm run e2e:devnet
```

Local Stellar quickstart container:

```bash
STELLAR_NETWORK=local npm run e2e:local
```

### Run the web app

```bash
# Terminal 1 — relayer
npm run dev:relayer

# Terminal 2 — dashboard
npm run dev:web
```

Open the dashboard, connect a Stellar wallet (Freighter, xBull, Albedo, etc.), sign the one-time key derivation, and use **Shield → Transfer → Unshield**.

Set `VITE_RELAYER_URL` if the relayer is not at `http://127.0.0.1:8787`.

---

## Network configuration

Edit `packages/config/networks.json`. Select a network with `STELLAR_NETWORK`:

| Value | Use |
|-------|-----|
| `local` | Stellar quickstart Docker container |
| `futurenet` | Stellar devnet (default for E2E) |
| `testnet` | Stellar testnet |
| `mainnet` | Production |

Deployment addresses are written to `scripts/deployment.json` (gitignored) and copied to `apps/web/public/deployment.json` for the web app.

---

## Toolchain versions

UltraHonk on Soroban requires proofs generated with matching toolchain versions:

| Tool | Version |
|------|---------|
| Nargo | 1.0.0-beta.9 (keccak transcript) |
| Barretenberg `bb` | v0.87.0 with `--oracle_hash keccak` |
| `@aztec/bb.js` | 0.87.0 |
| `@noir-lang/noir_js` | 1.0.0-beta.9 |

Upgrade Nargo, `bb`, or the verifier contract together — mismatched versions will fail proof verification.

---

## Repository layout (key paths)

| Path | Description |
|------|-------------|
| `packages/circuits/src/main.nr` | Main shielded transfer circuit |
| `packages/contracts/shielded-pool/src/lib.rs` | Pool contract implementation |
| `packages/contracts/merkle-tree/src/lib.rs` | Incremental Merkle tree |
| `packages/sdk/src/` | Hashing, keys, routing encryption, proof helpers |
| `apps/web/src/lib/merkle-sync.ts` | Rebuild Merkle leaves from chain events |
| `apps/web/src/lib/wallet-sync.ts` | Chain-first note scan and nullifier recheck |
| `apps/web/src/lib/shield-ops.ts` | Build shield / transfer / unshield transactions |
| `services/relayer/src/server.js` | Relayer HTTP API |

---

