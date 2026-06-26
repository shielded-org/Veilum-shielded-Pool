# Veilum — Private Stablecoin Payments for Stellar

> **Warning**
>
> This project is a **work in progress**. The code has not been audited and should not be used in production with real assets. Security hardening and operational review are still planned.

A privacy-preserving payment protocol for the Stellar network using zero-knowledge proofs. Users **shield** public stablecoins into encrypted notes, **transfer** value privately inside a shielded pool, and **unshield** to public Stellar accounts when they choose with spend authorization enforced by UltraHonk proofs verified on-chain in Soroban smart contracts.

The system Implements **Association Set Providers (ASPs)** as a compliance boundary: ASPs maintain an on-chain membership Merkle tree and a deny list so pool operators can gate who may enter and exit the pool, without deanonymizing internal private transfers.

## Features

- **Private transfers**: Send shielded notes without revealing sender identity, recipient Stellar address, or amount on-chain
- **Multi-asset pool**: One pool custodies multiple enabled Stellar tokens (USDC, EURC, and test mocks); each note is bound to a specific asset
- **Zero-knowledge proofs**: UltraHonk proofs generated from Noir circuits and verified in Soroban via `rs-soroban-ultrahonk`
- **Relayer-submitted spends**: Private transfers and unshields are submitted by a relayer so the user's wallet is not the on-chain transaction source
- **Shielded receive addresses**: Recipients share `shd_…` addresses; senders route encrypted notes without knowing the recipient's `G…` account
- **ASP compliance boundary**: Membership proofs on shield/unshield; internal transfers stay private and ASP-free
- **Browser-based proving**: Client-side proof generation with Noir.js and Barretenberg (`@aztec/bb.js`), with CLI proving on the relayer for reliable on-chain verification
- **Stellar integration**: Built on Soroban smart contracts, Stellar Wallets Kit, and standard token approvals for deposits
- **Pool events indexer**: Archives pool contract events and merkle leaf commitments below Soroban RPC retention; serves ordered merkle snapshots for fast client sync

## Demo Application

The demo consists of five main parts:

- **Frontend** (`apps/web/`): Marketing pages (`/`, `/about`, `/how-to-use`) and a dashboard (`/dashboard/*`) for wallet connect, shield, transfer, unshield, notes, keys, faucet, and ASP admin
- **Circuits** (`packages/circuits/`, `packages/circuits-asp/`): Noir circuits where constraints are defined — note hashing, Merkle membership, nullifiers, balance conservation, and ASP membership
- **Smart contracts** (`packages/contracts/`): Soroban contracts that hold pool state, verify proofs, and process deposits, transfers, and withdrawals
- **Services** (`services/relayer/`, `services/asp/`, `services/indexer/`): HTTP relayer for private operations, ASP service for membership registry and screening, and pool-events indexer for merkle/history archival

### Try it out

**Option A — Testnet (contracts already deployed)**

1. Open the hosted web app https://veilum-shield.vercel.app/ (or run the web app locally against testnet — see Option B, step 3 only).
2. Connect a Stellar wallet (Freighter, xBull, Albedo, Lobstr, etc.).
3. Sign the one-time key-derivation consent to derive local spending and viewing keys (keys never leave the browser).
4. If ASP shield enforcement is enabled, the asp screens, register and get approve (via the ASP service API running) before shielding.
5. **Shield** public test tokens → **Transfer** privately to a `shd_…` address → **Unshield** to a public `G…` recipient.

Canonical testnet contract IDs live in `apps/web/public/deployment.json`.

**Option B — Local / Futurenet (full stack)**

1. **Prerequisites**: [Stellar CLI](https://developers.stellar.org/docs/tools/cli), [Nargo](https://noir-lang.org) **1.0.0-beta.9**, [Barretenberg](https://github.com/AztecProtocol/aztec-packages) `bb` **v0.87.0** (`--oracle_hash keccak`), Rust + `wasm32v1-none`, Node.js 20+.

2. **Install and build**:

   ```bash
   cd privacy
   npm install
   npm run build:sdk
   npm run build:circuits
   npm run build:circuits:asp   # required when ASP is enabled
   npm run build:contracts
   npm run generate:bindings
   ```

3. **Deploy and verify** (Futurenet example):

   ```bash
   STELLAR_NETWORK=futurenet npm run e2e:devnet
   ```

   For a local Stellar quickstart container:

   ```bash
   STELLAR_NETWORK=local npm run e2e:local
   ```

   For the full ASP compliance flow:

   ```bash
   npm run e2e:asp
   ```

   Deployment addresses are written to `scripts/deployment.json` and copied to `apps/web/public/deployment.json`.

4. **Serve the stack** (four terminals):

   ```bash
   npm run dev:relayer          # :8787
   npm run dev --workspace @stellar-shielded/asp   # :8788 (if ASP enabled)
   npm run dev:indexer          # :8789
   npm run dev:web              # Vite dev server
   ```

   Copy `apps/web/.env.example` to `apps/web/.env.local` if relayer, ASP, or indexer are not at default localhost URLs.

5. Open the dashboard, connect a wallet, derive keys, and run **Shield → Transfer → Unshield**.

### Architecture Overview

#### Transaction Flow

1. **Shield (deposit)**: User deposits public tokens into the pool, creating a note commitment in the Merkle tree. The depositor wallet signs the transaction; deposit address, token, and amount are **visible on-chain**. An encrypted note is published as a Soroban route event for wallet sync.
2. **Private transfer**: User spends an existing note and creates recipient + change output notes. The **relayer** submits the transaction. Nullifiers and output commitments are visible; sender, recipient Stellar address, and amount are **not** revealed. No ASP check on internal transfers.
3. **Unshield (withdraw)**: User proves note ownership and withdraws to a public `G…` address (and optional change note). The relayer submits the transaction. Recipient and amount are **visible on-chain**; which prior notes funded the withdrawal are **not** directly revealed.

```
Public balance  ──shield──▶  Shielded note (Merkle tree)
                                    │
                                    ├── private transfer ──▶  Recipient note + change note
                                    │
                                    └── unshield ──▶  Public balance
```

| Action | Signer | Visible on-chain | Hidden on-chain |
|--------|--------|------------------|-----------------|
| Shield | User wallet | Depositor, token, amount | Note plaintext |
| Private transfer | Relayer | Nullifiers, commitments, encrypted route events | Sender, recipient `G…`, amount |
| Unshield | Relayer | Recipient `G…`, amount, nullifier, change commitment | Which input notes funded the exit |

#### ASP Admin

The ASP layer controls **who may cross the pool boundary** (shield in, unshield out). It does **not** deanonymize internal private transfers.

- **Dashboard → ASP Admin** (`/dashboard/asp-admin`): Operator queue to approve or deny users by `owner_pk`
- **ASP service** (`:8788`): `POST /asp/register`, `POST /asp/approve`, `POST /asp/deny`, `GET /asp/path/:ownerPk` for Merkle siblings, optional Horizon fund-source screening when `ASP_AUTO_SCREEN=1`
- **On-chain**: `asp-membership` (allow-tree), `asp-deny` (block list), `asp-gate` (ASP unshield verifier)

```
  Public Stellar          │  Shielded pool (ZK transfers)  │  Public Stellar
                          │                                │
  User ──shield──────────►│  Alice ──private send──► Bob   │  ◄──unshield── Bob
         ▲                │   (no ASP check)             │        ▲
    ASP membership        │                                │   ASP membership
    + deny list           │                                │   + deny list
```

#### Zero-Knowledge Circuits

**`shielded_transfer`** (standard transfer and unshield) proves:

- Merkle membership of 1–2 input notes (depth 20)
- Knowledge of spending keys and correct nullifiers (`hash2(spending_key, commitment)`)
- Valid output commitments for recipient and change
- Value conservation on transfer (`mode = 0`)
- Partial or full unshield with optional private change note (`mode = 1`)

**`shielded_transfer_asp`** (ASP-gated unshield) extends the standard circuit with ASP Merkle membership (depth 10):

```
asp_leaf = hash3(owner_pk, membership_blinding, domain=2)
```

Auxiliary circuits (`note-hash`, `hash2`, `hash3`) provide Poseidon2 hashing consistent across Noir, the SDK, and on-chain `soroban-poseidon`.

**Proof size:** 456 × 32 bytes. **Public inputs:** 12 (standard) or 14 (ASP).

#### Smart Contracts

| Contract | Role |
|----------|------|
| **shielded-pool** | Custodies tokens; `shield_routed`, `shielded_transfer_routed`, `unshield`, `fulfill_unshield`; nullifier set; ASP shield gate |
| **merkle-tree** | Incremental Poseidon2 tree (depth 20, 30-root history) |
| **rs-soroban-ultrahonk** | On-chain UltraHonk proof verification |
| **asp-membership** | Append-only allow-tree of approved `owner_pk` leaves (depth 10) |
| **asp-deny** | Persistent deny map keyed by `owner_pk` |
| **asp-gate** | Verifies ASP unshield proof + deny check + calls `pool.fulfill_unshield` |
| **mock-token** | Mintable SAC-style tokens for local/devnet/E2E |

#### Relayer

The relayer (`services/relayer/`, default `:8787`) submits private operations so the user's Stellar address is not the transaction source.

| Endpoint | Status |
|----------|--------|
| `POST /relay/shielded-transfer` | Active |
| `POST /relay/unshield` | Active |
| `GET /relay/status/:id` | Poll confirmation |
| `POST /relay/shield` | **Disabled (410)** — shield requires the depositor wallet to sign |

Shield is intentionally **not** relayer-submitted: a relayer-signed deposit would link the shield to the relayer's Stellar address instead of the user's.

#### Pool events indexer

The indexer (`services/indexer/`, default `:8789`) archives **pool contract events** and **merkle leaf commitments** so the web client can rebuild the shielded Merkle tree without re-scanning the full chain on every private transfer.

Soroban RPC only retains recent ledger history. Older pool transactions fall out of `getEvents` / `getTransaction` windows, but commitments are still needed to build spend paths. The indexer closes that gap by:

1. **Tailing pool events** from Soroban RPC (with fallback mirrors) and persisting them to disk
2. **Extracting per-tx merkle leaves** from transaction envelopes (RPC, then Horizon for archived ledgers)
3. **Rebuilding an ordered merkle leaf list** after each poll
4. **Serving archived data** to the web app for gap events, per-tx leaf cache, and fast-path merkle sync

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness, pool id, event count, merkle leaf stats |
| `GET /pool/:poolId/events?fromLedger=&toLedger=` | Archived contract events (pre-RPC-window history) |
| `GET /pool/:poolId/tx-leaves?txHashes=` | Cached merkle commitments per tx (omit `txHashes` for full map) |
| `GET /pool/:poolId/merkle-leaves` | Ordered merkle leaf list + `leafCount` / `missingTxCount` |

**Client sync strategy** (see `apps/web/src/lib/merkle-sync.ts`):

1. **Indexer fast path** — if ordered leaves match on-chain `next_index` and root, skip per-tx fetches
2. **Live rebuild** — scan RPC events + indexer gap events; fetch tx envelopes via RPC → Horizon → indexer cache
3. **Recovery** — batch re-fetch missing tx leaves from the indexer on count mismatch

**Production:** `https://veilum-shielded-indexer.fly.dev` (proxied in the Vite dev server and Vercel as `/api/indexer`). Deploy with:

```bash
npm run deploy:indexer   # fly deploy --config fly.indexer.toml
```

Persistent state lives on a Fly volume (`indexer_data` → `/data`). Copy `services/indexer/.env.example` for local configuration.

#### Keys and shielded addresses

Keys are derived locally from a one-time wallet signature — they never leave the browser.

```
commitment = hash4(owner_pk, token_field, amount, blinding)
nullifier  = hash2(spending_key, commitment)
owner_pk   = hash2(spending_key, 1)
```

Recipients share a **`shd_…` shielded address** (owner public key + viewing public key + network id + checksum) so senders can deliver encrypted notes without knowing the recipient's Stellar account. Routed delivery uses Keccak-derived **channels** and **subchannels** from the viewing key; note plaintext is ECDH-encrypted (secp256k1) with AES-256-GCM.

Implementation: `packages/sdk/`, `apps/web/src/lib/keys.ts`, `apps/web/src/lib/shielded-address.ts`, `packages/sdk/src/routing.ts`.

## Limitations

- **Privacy scope**: Transaction privacy for internal transfers only. Shield and unshield are public by design. Nullifiers, route-event channel clustering, relayer timing, and Merkle metadata remain visible to sophisticated observers.
- **Not audited**: Smart contracts and the on-chain UltraHonk verifier have not undergone a security audit.

## Cryptographic stack

| Primitive | Algorithm | Usage |
|-----------|-----------|-------|
| Note / Merkle / nullifier hashing | Poseidon2 (BN254) | Commitments, tree nodes, nullifiers |
| ZK proofs | UltraHonk (Barretenberg, Keccak transcript) | Spend authorization |
| Note encryption | ECDH (secp256k1) + HKDF + AES-256-GCM | Routed note delivery |
| Routing IDs | Keccak-256 | Channel and subchannel derivation |

**Toolchain lock** (upgrade together): Nargo **1.0.0-beta.9**, `bb` **v0.87.0** with `--oracle_hash keccak`, `@aztec/bb.js` **0.87.0**, `soroban-sdk` **25.0.2**.

## Configuration

| Variable | Where | Purpose |
|----------|-------|---------|
| `STELLAR_NETWORK` | root `.env` | `local`, `futurenet`, `testnet`, `mainnet` |
| `RELAYER_SECRET_KEY` | `services/relayer/.env` | Signs relayer Soroban txs |
| `ASP_ENFORCE`, `ASP_SERVICE_URL` | relayer `.env` | Gate unshield via ASP |
| `ASP_ADMIN_TOKEN`, `ASP_MEMBERSHIP_CONTRACT` | `services/asp/.env` | ASP operator API and on-chain contracts |
| `INDEXER_POOL_ID`, `INDEXER_DEPLOY_LEDGER` | `services/indexer/.env` | Pool to index and deploy ledger hint |
| `STELLAR_RPC_URL`, `STELLAR_RPC_FALLBACK_URLS` | `services/indexer/.env` | Soroban RPC endpoints for event tailing |
| `STELLAR_HORIZON_URL`, `INDEXER_ASP_GATE_ID` | `services/indexer/.env` | Archived tx envelopes; ASP-gate leaf extraction |
| `INDEXER_DATA_DIR`, `INDEXER_POLL_MS` | `services/indexer/.env` | Storage path and poll interval (default 60s) |
| `VITE_RELAYER_URL`, `VITE_ASP_URL`, `VITE_INDEXER_URL` | `apps/web/.env.local` | Local dev service URLs |

Network RPC and passphrase: `packages/config/networks.json`. Deployment output: `scripts/deployment.json` → `apps/web/public/deployment.json`.

## Repository layout

```
privacy/
├── apps/web/                  # Marketing site + dashboard
├── packages/
│   ├── circuits/              # shielded_transfer (12 public inputs)
│   ├── circuits-asp/          # shielded_transfer_asp (14 public inputs)
│   ├── sdk/                   # Hashing, keys, routing, proofs, relayer client
│   ├── contract-clients/      # Generated TypeScript bindings
│   └── contracts/             # Pool, Merkle tree, verifier, ASP suite, mock tokens
├── services/
│   ├── relayer/               # HTTP relayer (:8787)
│   ├── asp/                   # ASP compliance service (:8788)
│   └── indexer/               # Pool events + merkle leaf indexer (:8789)
├── fly.indexer.toml           # Fly.io deploy config for production indexer
└── scripts/                   # Build, deploy, E2E
```

## License

See individual package licenses. The UltraHonk verifier crate (`packages/contracts/rs-soroban-ultrahonk`) is MIT-licensed.
