# Veilum

**Veilum** is a private stablecoin payment protocol on Stellar. Users shield public tokens into encrypted notes, send value privately inside a zero-knowledge pool, and withdraw to public Stellar accounts when they choose — with proofs verified on-chain via Soroban smart contracts.

> Shield. Send privately. Withdraw on your terms — with on-chain proof, not blind trust.

Built on Stellar Soroban, Veilum brings shielded-pool privacy to the assets and rails Stellar already excels at: fast settlement, low fees, and regulated stablecoins (USDC, EURC, and others).

**Status:** Functional prototype on testnet/devnet. Not audited for production.

---

## Table of contents

- [Why Veilum](#why-veilum)
- [What Veilum is and is not](#what-veilum-is-and-is-not)
- [Product surfaces](#product-surfaces)
- [Core flows](#core-flows)
- [Keys, identity, and shielded addresses](#keys-identity-and-shielded-addresses)
- [Channels and subchannels](#channels-and-subchannels)
- [Architecture](#architecture)
- [Smart contracts](#smart-contracts)
- [Zero-knowledge circuits](#zero-knowledge-circuits)
- [Cryptographic stack](#cryptographic-stack)
- [Association Set Provider (ASP)](#association-set-provider-asp)
- [Relayer](#relayer)
- [Web dashboard](#web-dashboard)
- [Supported assets](#supported-assets)
- [Privacy model](#privacy-model)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Toolchain versions](#toolchain-versions)
- [Scripts and E2E](#scripts-and-e2e)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [Repository layout](#repository-layout)

---

## Why Veilum

Public blockchains make payments transparent by default. Every transfer reveals who paid whom and how much. That is fine for auditability, but it is a poor default for everyday payments, payroll, treasury operations, and any flow where counterparties should not see each other's balances or history.

Stellar already moves stable value efficiently. What it lacks is a native way to pay privately without leaving the network. Veilum fills that gap:

| Capability | Description |
|------------|-------------|
| **Private transfers** | Recipients receive shielded notes; sender identity, recipient Stellar address, and amount are not revealed in the transfer transaction |
| **Multi-asset support** | One pool custodies multiple enabled Stellar tokens; each note is bound to a specific asset via a public token field |
| **On-chain verification** | Spend authorization is enforced by UltraHonk zero-knowledge proofs verified inside Soroban, not by trusted intermediaries |
| **Relayer-friendly** | Private sends and unshields are submitted by a relayer so the user's wallet is not the on-chain signer |
| **Boundary compliance** | Association Set Provider (ASP) gates who may shield in and unshield out without deanonymizing internal transfers |
| **Composable with Stellar** | Shield and unshield remain standard token transfers; only the private layer uses ZK |

### Target users

- Freelancers and contractors receiving private USDC
- Payers sending to counterparties without exposing Stellar payment history
- Treasury and ops teams moving funds with less on-chain leakage
- Developers evaluating shielded payments on Stellar testnet

---

## What Veilum is and is not

| Veilum **is** | Veilum **is not** |
|---------------|-------------------|
| A shielded pool on Stellar Soroban | A mixer or anonymity tool for obfuscation |
| Transaction privacy for internal transfers | Full anonymity — deposits and withdrawals are public |
| A browser wallet with locally derived keys | A custodian of user spending keys |
| A relayer-submitted ZK payment layer | A replacement for Stellar's public payment rail |

---

## Product surfaces

Veilum ships as a monorepo with marketing pages, a dashboard app, backend services, on-chain contracts, and ZK circuits.

| Surface | Path | Purpose |
|---------|------|---------|
| **Marketing site** | `apps/web/` routes `/`, `/about`, `/how-to-use` | Explain the protocol, privacy boundaries, drive users to the dashboard |
| **Dashboard** | `apps/web/` routes `/dashboard/*` | Wallet connect, shield, transfer, unshield, notes, keys, faucet |
| **ASP Admin** | `/dashboard/asp-admin` | Operator approve/deny queue (when ASP is enabled) |
| **Relayer** | `services/relayer/` (:8787) | Submit private transfers and unshields to Soroban |
| **ASP service** | `services/asp/` (:8788) | Membership registry, screening, on-chain approve/deny |
| **SDK** | `packages/sdk/` | Hashing, keys, routing crypto, proofs, relayer client |
| **Contracts** | `packages/contracts/` | Pool, Merkle tree, verifier, ASP suite |
| **Circuits** | `packages/circuits/`, `circuits-asp/` | Noir UltraHonk spend proofs |

---

## Core flows

### Lifecycle

```
Public balance  ──shield──▶  Shielded note (in Merkle tree)
                                    │
                                    ├── private transfer ──▶  Recipient note + change note
                                    │
                                    └── unshield ──▶  Public balance (recipient + amount visible)
```

### On-chain visibility

| Action | Signer | On-chain visibility |
|--------|--------|---------------------|
| **Shield (deposit)** | User wallet | Visible: depositor address, token, amount |
| **Private transfer** | Relayer | Visible: nullifiers, output commitments, encrypted route events. Hidden: sender, recipient Stellar address, amount |
| **Unshield (withdraw)** | Relayer | Visible: recipient address, amount, nullifier, change commitment. Hidden: which prior notes funded the withdrawal |

### Shield

1. User selects token and amount in the dashboard
2. Client builds a note commitment and ECDH-encrypts note plaintext for self
3. User wallet signs `shielded-pool.shield_routed` (token approval + deposit)
4. Pool custodies tokens and inserts commitment into the Merkle tree
5. Encrypted note published as a Soroban route event

ASP is enforced, the user must be approved and include an ASP membership proof in `asp_meta`.

### Private transfer

1. Client syncs Merkle tree from chain and selects an unspent note
2. Client builds recipient + change output notes, encrypts both, generates UltraHonk proof (`mode = 0`)
3. Client sends proof payload to relayer (`POST /relay/shielded-transfer`)
4. Relayer submits `shielded-pool.shielded_transfer_routed`
5. Pool verifies proof, marks nullifier spent, inserts two new commitments, publishes two route events

No ASP check on internal transfers.

### Unshield

1. Client selects note, withdrawal amount, and public Stellar recipient (`G…`)
2. Client generates proof (`mode = 1`) with public recipient field and amount
3. Relayer submits via legacy `shielded-pool.unshield` or ASP path `asp-gate.unshield_asp`
4. Pool transfers public tokens to recipient; optional change note stays shielded

---

## Keys, identity, and shielded addresses

### Note model

A **shielded note** is a commitment to `(owner_pk, token, amount, blinding)` hashed with Poseidon2:

```
commitment = hash4(owner_pk, token_field, amount, blinding)
nullifier  = hash2(spending_key, commitment)
owner_pk   = hash2(spending_key, 1)
```

Only the holder of the **spending key** can spend a note. The **viewing key** (secp256k1) decrypts incoming routed notes.

### Key derivation

Keys are derived locally from a one-time wallet signature — they never leave the browser.

1. User signs: `"Stellar shielded key derivation consent (deterministic, no transaction)"`
2. `keySeed = SHA256("stellar-shielded-wallet-seed-v1" || address || signature)`
3. `spending_key` ← BN254 scalar from seed
4. `viewingPriv` ← secp256k1 scalar from seed
5. `owner_pk = hash2(spending_key, 1)`
6. `viewingPub = secp256k1_pubkey(viewingPriv)` (compressed, 33 bytes)

Implementation: `apps/web/src/lib/keys.ts`, `packages/sdk/src/keys.ts`.

### Shielded receive address (`shd_…`)

Recipients share a **shielded address** so senders can route encrypted notes without knowing the recipient's Stellar account.

**Format:** `shd_` + base64url(payload + checksum)

| Field | Size | Description |
|-------|------|-------------|
| version | 1 byte | Format version (= 1) |
| network_id | 4 bytes | 1=local, 2=futurenet, 3=testnet, 4=mainnet |
| owner_pk | 32 bytes | BN254 public identity |
| viewing_pub | 33 bytes | Compressed secp256k1 viewing key |
| checksum | 4 bytes | `keccak256(payload)[0:4]` |

Implementation: `apps/web/src/lib/shielded-address.ts`.

---

## Channels and subchannels

Private transfers deliver encrypted note plaintext via Soroban events without revealing the recipient's Stellar address. Routing identifiers are derived from the recipient's viewing public key:

```
channel    = keccak256(viewingPub)
subchannel = keccak256(channel || uint64_be(subchannelId))
```

Each wallet maintains a monotonic **route cursor** (`subchannelId`), incremented on each shield, transfer, or unshield.

**On-chain event:**
```
topic: ("route", channel, subchannel)
data:  encrypted_note (ECDH + AES-256-GCM envelope)
```

Wallets scan pool events, filter by their channel, try subchannel indices in a scan window, ECDH-decrypt candidates, and reconcile against the on-chain nullifier set.

Implementation: `packages/sdk/src/routing.ts`, `apps/web/src/lib/scan.ts`, `apps/web/src/lib/wallet-sync.ts`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser / SDK                                                           │
│  Wallet connect · key derivation · proving (Noir.js + bb.js) · note scan │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTP (private ops)  │  Soroban RPC (shield)
┌───────────────────────────────┼─────────────────────────────────────────┐
│  Services                     │                                          │
│  Relayer :8787                │  ASP :8788                               │
│  · shielded-transfer          │  · register / approve / deny             │
│  · unshield                   │  · fund-source screening                   │
│  · CLI proof generation       │  · Merkle path API                       │
└───────────────────────────────┼─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Soroban (on-chain)                                                      │
│  shielded-pool · merkle-tree · rs-soroban-ultrahonk · asp-*             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Monorepo layout

```
privacy/
├── packages/
│   ├── circuits/              # shielded_transfer (12 public inputs)
│   ├── circuits-asp/          # shielded_transfer_asp (14 public inputs)
│   ├── note-hash/, hash2/, hash3/  # Auxiliary Noir hash circuits
│   ├── config/                # networks.json
│   ├── sdk/                   # Hashing, keys, routing, proofs, ASP, relayer client
│   ├── contract-clients/      # Generated TypeScript bindings
│   └── contracts/
│       ├── merkle-tree/       # Incremental Poseidon2 tree (depth 20)
│       ├── shielded-pool/     # Multi-token pool: shield, transfer, unshield
│       ├── asp-membership/    # Depth-10 allow-tree for ASP
│       ├── asp-deny/          # Deny map by owner_pk
│       ├── asp-gate/          # ASP unshield verifier + pool callback
│       ├── mock-token/        # Mintable SAC for devnet / E2E
│       └── rs-soroban-ultrahonk/  # On-chain UltraHonk verifier
├── apps/web/                  # Marketing site + dashboard
├── services/
│   ├── relayer/               # HTTP relayer (:8787)
│   └── asp/                   # ASP compliance service (:8788)
├── docs/                      # Architecture, product, technical paper
└── scripts/                   # Build, deploy, E2E
```

---

## Smart contracts

| Contract | Role |
|----------|------|
| **shielded-pool** | Custodies enabled tokens; `shield_routed`, `shielded_transfer_routed`, `unshield`, `fulfill_unshield`; nullifier set; ASP shield gate |
| **merkle-tree** | Incremental Poseidon2 tree, depth 20, 30-root history; `insert`, `is_known_root`, `get_last_root` |
| **rs-soroban-ultrahonk** | Verifies UltraHonk proofs (456 × 32 bytes; 12 or 14 public inputs depending on VK) |
| **asp-membership** | Append-only Merkle allow-tree (depth 10) of approved `owner_pk` leaves |
| **asp-deny** | Persistent deny map keyed by `owner_pk` |
| **asp-gate** | Verifies 14-input ASP unshield proof + deny check + calls `pool.fulfill_unshield` |
| **mock-token** | Mintable SAC-style token for local and devnet testing |

### Deployed contracts (testnet)

Canonical addresses live in `apps/web/public/deployment.json` (copied from `scripts/deployment.json` after deploy). IDs change when you redeploy; the table below matches the current testnet deployment (`network`: testnet, `deployLedger`: 3138857).

| Name | Package | `deployment.json` key | Contract ID |
|------|---------|----------------------|-------------|
| **Shielded Pool** | `shielded-pool` | `shieldedPool` | `CBU6QJ7H2LH2IFZUNTPVBH6637JXOADXVIZTGOLIFGKJREAB6R2AY7D4` |
| **Merkle Tree** | `merkle-tree` | `merkleTree` | `CDAAIDJKLZN5ZR7DCJXS6LWCILPIFAZFHQ7VWQ5YHN5BRXD4XO5UE7AR` |
| **UltraHonk Verifier** (standard) | `rs-soroban-ultrahonk` | `verifier` | `CDGRAZJD57XH5KFWYDTFRMJM33UUAYV3UO7YJ4F5RIR4BXPBXAALBD65` |
| **UltraHonk Verifier** (ASP) | `rs-soroban-ultrahonk` | `verifierAsp` | `CCRCUHVIVRLFM2MMGY3EVIE2MX2DDIFEKMPWQMAFH2KJMGPIMYW3MXQR` |
| **ASP Membership** | `asp-membership` | `aspMembership` | `CCUNWW5XXCBS2QQOYOWGCMC7UMOKWWVV7OHC6MJXISTLEDHSBTQFRVEI` |
| **ASP Deny** | `asp-deny` | `aspDeny` | `CAUKPALXFWJ5OCBETYILQ5FIZG5LJ5ZXA2DE2VFZJKBE4OQ5UAERDFQ7` |
| **ASP Gate** | `asp-gate` | `aspGate` | `CC2E22YO333KAES2UD3IL2SLPQN3VBQ66MC7JHWJWKGYTBHV4XEQ35A6` |
| **Mock USDC** | `mock-token` | `tokens.USDC` | `CBULS57QC5XGP7Z2AKCUVUFCTEYPKJF5AMBRIIZD6W6XKQHHGCOYCOFK` |
| **Mock EURC** | `mock-token` | `tokens.EURC` | `CAPKRERUTGEPAWZ7QW6K7U5WUD5DVWVEMW43AVRCOI7WADGMY24DAIJ3` |
| **Mock YLDS** | `mock-token` | `tokens.YLDS` | `CB4LFC4JF247V6U3SN7CTDDHMIA54PKVZUPTWDG5M7CQSS6VPPMVJUMY` |
| **Mock MGUSD** | `mock-token` | `tokens.MGUSD` | `CBWBVC6LE4RORGJ5M4IHNPIRHEBKF7O2JIRHR3IF4IITT766PUJ7QCOK` |

**Deployment flags** (same file): `aspEnforceShield: true`, `indexedRouteEvents: true`.

On **local** / **futurenet**, run `npm run e2e` (and `npm run deploy:stables` for tokens) to generate fresh IDs. On **mainnet**, stablecoin rows would point at real Circle / issuer SAC contracts instead of `mock-token` deployments.

External tokens are custodied in the pool. Each enabled token maps to a BN254 **token field**:

```
token_field = sha256(contract_id_strkey) with high byte cleared
```

The field is a public circuit input so notes cannot be cross-asset confused.

**Nullifiers:** Persistent map `Nullifier(bytes32) → true`. Zero nullifiers rejected; double-spend rejected.

---

## Zero-knowledge circuits

### `shielded_transfer` (standard)

Proves:

- Merkle membership of 1–2 input notes (depth 20)
- Correct nullifier: `hash2(spending_key, commitment)`
- Valid output commitments for recipient + change
- Value conservation on transfer (`mode = 0`)
- Partial or full unshield with private change note (`mode = 1`)

**Proof size:** 456 × 32 = 14,592 bytes  
**Public inputs:** 12 × 32 = 384 bytes

| Index | Transfer (mode=0) | Unshield (mode=1) |
|-------|-------------------|-------------------|
| 0 | token field | token field |
| 1 | merkle root | merkle root |
| 2–3 | nullifiers | nullifier + zero |
| 4–5 | output commitments | change commitment + zero |
| 6–7 | fee + fee recipient (zero in wallet flow) | zero |
| 8 | mode (= 0) | mode (= 1) |
| 9–11 | zero | recipient field, amount, token field |

### `shielded_transfer_asp` (ASP unshield)

Extends the standard circuit with ASP Merkle membership (depth 10):

```
asp_leaf = hash3(owner_pk, membership_blinding, domain=2)
```

Adds public inputs 12 (`asp_membership_root`) and 13 (`owner_pk_public`). Used for ASP-gated unshield only.

### Auxiliary circuits

| Circuit | Purpose |
|---------|---------|
| `note-hash` | `hash4(owner, token, amount, blinding)` |
| `hash2` | Poseidon2 two-input hash |
| `hash3` | Poseidon2 three-input hash (ASP leaves) |

Poseidon2 must match across Noir, `soroban-poseidon` (on-chain), and the SDK.

---

## Cryptographic stack

| Primitive | Algorithm | Usage |
|-----------|-----------|-------|
| Note / Merkle / nullifier hashing | Poseidon2 (BN254 field) | Commitments, tree nodes, nullifiers, owner_pk |
| ZK proofs | UltraHonk (Barretenberg, Keccak transcript) | Spend authorization |
| Note encryption | ECDH (secp256k1) + HKDF-SHA256 + AES-256-GCM | Routed note delivery |
| Routing IDs | Keccak-256 | Channel and subchannel derivation |
| Key derivation | SHA-256 | Wallet seed and scalar derivation |
| Shielded address checksum | Keccak-256 | `shd_` integrity |
| Token / recipient fields | SHA-256 (high byte cleared) | Asset and Stellar address binding in circuit |

**Toolchain lock:** Nargo 1.0.0-beta.9 + Barretenberg bb v0.87.0 (`--oracle_hash keccak`) + `@aztec/bb.js` 0.87.0. Mismatched versions fail on-chain verification.

**Proving paths:**

| Environment | Method | Reliability |
|-------------|--------|-------------|
| Browser | Noir.js + `@aztec/bb.js` | May diverge from on-chain verifier |
| Relayer / E2E | `nargo execute` + `bb prove` (CLI) | Matches on-chain verifier |

The relayer accepts `proofInputs` and generates proofs via CLI for reliable submission.

---

## Association Set Provider (ASP)

ASP controls **who may cross the pool boundary** (shield in, unshield out). It does not deanonymize internal private transfers.

```
  Public Stellar          │  Shielded pool (ZK transfers)  │  Public Stellar
                          │                                │
  User ──shield──────────►│  Alice ──private send──► Bob   │  ◄──unshield── Bob
         ▲                │   (no ASP check)             │        ▲
    ASP membership        │                                │   ASP membership
    + deny list           │                                │   + deny list
```

### Three enforcement layers

| Layer | Component | Scope |
|-------|-----------|-------|
| Off-chain | ASP service (:8788) | Registry, screening, Merkle path API |
| Relayer | `GET /asp/check/:ownerPk` | Blocks unshield for denied/unapproved users |
| On-chain | `asp-membership`, `asp-deny`, `asp-gate` | Cryptographic membership proof + deny map |

### ASP HTTP API

| Endpoint | Purpose |
|----------|---------|
| `POST /asp/register` | Queue user by `owner_pk` |
| `POST /asp/approve` | Admin approve + on-chain `insert_member` |
| `POST /asp/deny` | Admin deny + on-chain `deny` |
| `POST /asp/screen` | Horizon fund-source scan → auto approve/deny |
| `GET /asp/check/:ownerPk` | Relayer gate (200/403) |
| `GET /asp/status/:ownerPk` | UI status |
| `GET /asp/path/:ownerPk` | Merkle siblings for shield/unshield proofs |
| `GET /asp/pending` | Admin queue |

When `ASP_AUTO_SCREEN=1`, the ASP service scans inbound Horizon payments for known-bad funders before granting membership.

Full architecture: [`docs/asp-architecture.md`](docs/asp-architecture.md).

---

## Relayer

The relayer submits private operations to Soroban so the user's Stellar address is not the transaction source.

| Endpoint | Method | Status |
|----------|--------|--------|
| `/relay/shielded-transfer` | POST | Active |
| `/relay/unshield` | POST | Active |
| `/relay/status/:id` | GET | Poll tx confirmation |
| `/relay/shield` | POST | **Disabled (410)** — shield requires depositor wallet auth |

**Why shield is not relayer-submitted:** A relayer-signed shield would link the deposit to the relayer's Stellar address instead of the user's.

Configuration: `services/relayer/.env` (see [Configuration](#configuration)).

---

## Web dashboard

### Marketing routes

| Route | Page |
|-------|------|
| `/` | Home — value prop, CTA to dashboard |
| `/about` | Protocol overview and privacy boundaries |
| `/how-to-use` | Step-by-step user guide |

### Dashboard routes

| Route | Page |
|-------|------|
| `/dashboard` | Balances, notes preview, activity, relayer status |
| `/dashboard/shield` | Deposit public tokens into shielded notes |
| `/dashboard/transfer` | Private transfer to `shd_…` address |
| `/dashboard/unshield` | Withdraw to public Stellar address |
| `/dashboard/notes` | All discovered notes (unspent/spent) |
| `/dashboard/keys` | Shielded receive address + key management |
| `/dashboard/faucet` | Testnet token mint (dev only) |
| `/dashboard/asp-admin` | ASP operator approve/deny queue |

**Wallets:** Freighter, xBull, Albedo, Lobstr, and others via Stellar Wallets Kit.

**Privacy UX:** Every action surfaces what is public vs private on-chain. See [`PRODUCT.md`](PRODUCT.md) and [`docs/veilum-product-brief.md`](docs/veilum-product-brief.md) for copy and design guidance.

---

## Supported assets

| Symbol | Name | Notes |
|--------|------|-------|
| **USDC** | USD Coin | Primary default |
| **EURC** | Euro Coin | |
| **YLDS** | Figure YLDS | Testnet mock |
| **MGUSD** | MoneyGram USD | Testnet mock |

On devnet/testnet, mock SAC tokens are deployed via `scripts/deploy-stables.mjs`. On mainnet, the pool owner enables real token contract addresses.

---

## Privacy model

### Protected in private transfers

- Sender Stellar address (relayer submits the tx)
- Recipient Stellar address
- Transfer amount
- Which input notes funded the transfer (beyond nullifier linkage)

### Still visible on-chain

- Nullifiers (link spends of the same note, not identities directly)
- Output note commitments
- Encrypted route events (channel/subchannel clustering)
- Merkle tree shape (`FilledSubtrees`, leaf count)
- Shield and unshield metadata (by design — deposit and exit are public)
- Relayer transaction source and timing

Veilum provides **transaction privacy**, not full anonymity. Advanced adversaries may correlate timing, relayer activity, nullifier graphs, and channel clustering.

---

## Quickstart

### Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`)
- [Nargo](https://noir-lang.org) **1.0.0-beta.9** + [Barretenberg](https://github.com/AztecProtocol/aztec-packages) `bb` **v0.87.0** (`--oracle_hash keccak`)
- Rust + `wasm32v1-none` target
- Node.js 20+

Ensure `nargo` and `bb` are on `PATH` (e.g. `~/.nargo/bin`, `~/.bb/bin`).

### Install and build

```bash
cd privacy
npm install
npm run build:sdk
npm run build:circuits
npm run build:circuits:asp   # if using ASP
npm run build:contracts
npm run generate:bindings
```

### E2E (Futurenet)

```bash
STELLAR_NETWORK=futurenet npm run e2e:devnet
```

Local Stellar quickstart container:

```bash
STELLAR_NETWORK=local npm run e2e:local
```

ASP full flow:

```bash
npm run e2e:asp
```

### Run locally

```bash
# Terminal 1 — relayer
npm run dev:relayer

# Terminal 2 — ASP (optional)
npm run dev --workspace @stellar-shielded/asp

# Terminal 3 — dashboard
npm run dev:web
```

Open the dashboard, connect a Stellar wallet, sign the one-time key derivation, and use **Shield → Transfer → Unshield**.

Set `VITE_RELAYER_URL` if the relayer is not at `http://127.0.0.1:8787`. Set `VITE_ASP_URL` if ASP is enabled.

---

## Configuration

### Network

Edit `packages/config/networks.json`. Select a network with `STELLAR_NETWORK`:

| Value | Use |
|-------|-----|
| `local` | Stellar quickstart Docker container |
| `futurenet` | Stellar devnet (default for E2E) |
| `testnet` | Stellar testnet |
| `mainnet` | Production |

Deployment addresses are written to `scripts/deployment.json` (gitignored) and copied to `apps/web/public/deployment.json`.

### Environment variables

**Root `.env`** (E2E / deploy scripts):

| Variable | Purpose |
|----------|---------|
| `STELLAR_NETWORK` | Network selection |
| `SOURCE_ACCOUNT` / `STELLAR_SECRET_KEY` | Deployer / admin |
| `RELAYER_URL` | Relayer HTTP endpoint for E2E |
| `SKIP_DEPLOY`, `SKIP_VERIFIER_DEPLOY` | Reuse existing deployment |

**Relayer** (`services/relayer/.env`):

| Variable | Purpose |
|----------|---------|
| `RELAYER_SECRET_KEY` | Signs Soroban transactions |
| `RELAYER_PORT` | Default 8787 |
| `ASP_ENFORCE` | `1` to gate unshield via ASP |
| `ASP_SERVICE_URL` | ASP HTTP base URL |
| `ASP_GATE_CONTRACT` | ASP gate contract ID |

**ASP** (`services/asp/.env`):

| Variable | Purpose |
|----------|---------|
| `ASP_ADMIN_TOKEN` | Admin API bearer token |
| `ASP_SOURCE_ACCOUNT` | Signs `insert_member` / `deny` |
| `ASP_MEMBERSHIP_CONTRACT`, `ASP_DENY_CONTRACT` | On-chain ASP contracts |
| `ASP_AUTO_SCREEN` | `1` for Horizon fund-source screening |

**Web** (`apps/web/.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_RELAYER_URL` | Relayer endpoint |
| `VITE_ASP_URL` | ASP service endpoint |
| `VITE_ASP_ADMIN_TOKEN` | ASP admin UI token |

---

## Toolchain versions

UltraHonk on Soroban requires proofs generated with matching toolchain versions. Upgrade these together:

| Tool | Version |
|------|---------|
| Nargo | 1.0.0-beta.9 (keccak transcript) |
| Barretenberg `bb` | v0.87.0 with `--oracle_hash keccak` |
| `@aztec/bb.js` | 0.87.0 |
| `@noir-lang/noir_js` | 1.0.0-beta.9 |
| `soroban-sdk` | 25.0.2 |
| `@stellar/stellar-sdk` | ^14.1.0 |

Mismatched Nargo, `bb`, or verifier VK will cause on-chain `VerificationFailed`.

---

## Scripts and E2E

| Script | Command | Purpose |
|--------|---------|---------|
| Build circuits | `npm run build:circuits` | Compile Noir → UltraHonk VK + web artifacts |
| Build ASP circuits | `npm run build:circuits:asp` | ASP unshield circuit |
| Build contracts | `npm run build:contracts` | Build all Soroban WASM |
| Generate bindings | `npm run generate:bindings` | TypeScript contract clients |
| Deploy stables | `npm run deploy:stables` | USDC, EURC, YLDS, MGUSD mocks |
| E2E devnet | `npm run e2e:devnet` | Deploy + shield + private transfer |
| E2E ASP | `npm run e2e:asp` | Full ASP compliance flow |
| E2E local | `npm run e2e:local` | Quickstart container E2E |

---

## Known limitations

| Area | Limitation |
|------|------------|
| **Privacy** | Transaction privacy only; shield/unshield are public; nullifier and channel clustering visible |
| **Audits** | `rs-soroban-ultrahonk` verifier not audited |
| **Proving** | Browser `bb.js` proofs may fail on-chain; relayer CLI proving is the reliable path |
| **Fees** | Fee infrastructure exists in circuit/contract but wallet flow uses `fee = 0` |
| **ASP** | No membership check on private transfers; off-chain registry can drift from chain |
| **Capacity** | Merkle tree depth 20 (max ~1M notes); ASP tree depth 10 (max 1024 members) |
| **Operations** | Single-process relayer/ASP; no HA or rate limiting in prototype |
| **Mainnet** | Architecture implemented; production legal/compliance process out of scope |

---

## Repository layout

| Path | Description |
|------|-------------|
| `packages/circuits/src/main.nr` | Main shielded transfer circuit |
| `packages/circuits-asp/src/main.nr` | ASP unshield circuit |
| `packages/contracts/shielded-pool/src/lib.rs` | Pool contract |
| `packages/contracts/merkle-tree/src/lib.rs` | Incremental Merkle tree |
| `packages/contracts/asp-*/` | ASP membership, deny, gate |
| `packages/sdk/src/` | Hashing, keys, routing, proofs, ASP, relayer |
| `apps/web/src/lib/shield-ops.ts` | Shield / transfer / unshield builders |
| `apps/web/src/lib/merkle-sync.ts` | Rebuild Merkle leaves from chain |
| `apps/web/src/lib/wallet-sync.ts` | Note scan and nullifier recheck |
| `apps/web/src/lib/shielded-address.ts` | `shd_` encode/decode |
| `apps/web/src/lib/proving.ts` | Browser UltraHonk proving |
| `services/relayer/src/server.js` | Relayer HTTP API |
| `services/asp/` | ASP compliance service |
| `scripts/devnet-e2e.mjs` | Full deploy + shield + transfer E2E |
| `scripts/asp-e2e.mjs` | ASP E2E |

---

## License

See individual package licenses. UltraHonk verifier crate: MIT (`packages/contracts/rs-soroban-ultrahonk`).
