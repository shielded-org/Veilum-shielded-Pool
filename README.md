# Stellar Shielded Pool

Private payments on Stellar, adapted from the EVM [shielded-token](../shielded-token) `ShieldedERC20Pool` design and verified on-chain with the in-repo UltraHonk Soroban verifier.

## Architecture

```
packages/
  circuits/          Noir shielded_transfer circuit (Poseidon2, depth-20 Merkle)
  note-hash/         Auxiliary Noir circuit for note commitments (hash4)
  contracts/
    merkle-tree/     Incremental Merkle tree (soroban-poseidon, Noir-compatible)
    mock-token/      Mintable ERC20-style token for devnet E2E
    shielded-pool/   Multi-token shielded pool (shield / transfer / unshield)
    rs-soroban-ultrahonk/  On-chain UltraHonk verifier (copied from Clash)
  sdk/               Poseidon hashing, proof generation, network config
  config/            local | futurenet | testnet | mainnet
apps/web/            Minimal dapp shell
scripts/
  build-circuits.sh  nargo + bb (UltraHonk, keccak oracle)
  devnet-e2e.mjs     Deploy + mint/approve + shield + private transfer E2E
```

External ERC20-like tokens are custodied in the pool contract. Each enabled token gets a BN254 `token` public input (sha256 of the contract strkey, high byte cleared). The verifier WASM is built from `packages/contracts/rs-soroban-ultrahonk` and deployed with the circuit VK.

## Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`)
- [Nargo](https://noir-lang.org) 1.0.0-beta.9 + [Barretenberg](https://github.com/AztecProtocol/aztec-packages) `bb` v0.87.0 (`--oracle_hash keccak`)
- Rust + `wasm32v1-none` target
- Node.js 20+

## Quickstart (Futurenet devnet)

```bash
cd privacy
npm install
npm run build:sdk
npm run build:circuits
npm run build:contracts
STELLAR_NETWORK=futurenet npm run e2e:devnet
```

Local quickstart container:

```bash
STELLAR_NETWORK=local npm run e2e:local
```

## Network configuration

Edit `packages/config/networks.json`. Switch networks with `STELLAR_NETWORK`:

| Value | Use |
|-------|-----|
| `local` | Stellar quickstart Docker container |
| `futurenet` | Stellar devnet (default for E2E) |
| `testnet` | Stellar testnet |
| `mainnet` | Production |

Deployment addresses are written to `scripts/deployment.json`.

## Circuits

The circuit matches the EVM shielded-token design: note commitments, nullifiers, Merkle membership, transfer/unshield modes, and 12 public inputs for UltraHonk verification.

## Contracts

- **merkle-tree**: Poseidon2 `hash2` parent nodes, 30-root history window, depth 20
- **mock-token**: Simple mint / transfer / approve for E2E
- **shielded-pool**: `shield_routed`, `shielded_transfer_routed`, `unshield`, nullifier set, cross-contract UltraHonk `verify_proof`
- **rs-soroban-ultrahonk**: UltraHonk proof verification on Soroban

## Toolchain versions

UltraHonk on Soroban requires proofs generated with:

- Nargo 1.0.0-beta.9 (keccak transcript)
- bb v0.87.0 with `--oracle_hash keccak`

Match the verifier expectations when upgrading.
