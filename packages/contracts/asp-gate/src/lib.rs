#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Bytes, BytesN, Env, InvokeError,
    String, Symbol, Val, Vec as SorobanVec,
};
use soroban_sdk::IntoVal;

const PUBLIC_INPUT_COUNT_ASP: u32 = 14;
const PROOF_BYTES: u32 = 456 * 32;
const PROOF_BUNDLE_BYTES: u32 = PROOF_BYTES + PUBLIC_INPUT_COUNT_ASP * 32;
const ASP_TREE_DEPTH: u32 = 10;
const ASP_META_BYTES: u32 = 32 + 32 + 4 + ASP_TREE_DEPTH * 32 + 32;
const META_FIXED_BYTES: u32 = 32 + 32 + 32 + 32 + 32 + 16;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Pool,
    AspMembership,
    AspDeny,
    VerifierAsp,
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AspMembershipInvalid = 1,
    AspDenied = 2,
    AspNotConfigured = 3,
    VerificationFailed = 4,
    PoolFailed = 5,
}

#[contract]
pub struct AspGate;

fn read_bytes32(env: &Env, meta: &Bytes, offset: u32) -> BytesN<32> {
    let mut arr = [0u8; 32];
    for i in 0..32u32 {
        arr[i as usize] = meta.get(offset + i).unwrap_or(0);
    }
    BytesN::from_array(env, &arr)
}

fn read_siblings(env: &Env, asp_meta: &Bytes) -> SorobanVec<BytesN<32>> {
    let mut out: SorobanVec<BytesN<32>> = SorobanVec::new(env);
    for level in 0..ASP_TREE_DEPTH {
        let mut arr = [0u8; 32];
        for i in 0..32u32 {
            arr[i as usize] = asp_meta.get(68 + level * 32 + i).unwrap_or(0);
        }
        out.push_back(BytesN::from_array(env, &arr));
    }
    out
}

fn verify_asp_meta(env: &Env, asp_meta: &Bytes) -> Result<BytesN<32>, Error> {
    if asp_meta.len() != ASP_META_BYTES {
        return Err(Error::AspMembershipInvalid);
    }
    let membership: Address = env
        .storage()
        .instance()
        .get(&DataKey::AspMembership)
        .ok_or(Error::AspNotConfigured)?;
    let deny: Option<Address> = env.storage().instance().get(&DataKey::AspDeny);

    let owner_pk = read_bytes32(env, asp_meta, 0);
    let blinding = read_bytes32(env, asp_meta, 32);
    let mut idx_bytes = [0u8; 4];
    for i in 0..4u32 {
        idx_bytes[i as usize] = asp_meta.get(64 + i).unwrap_or(0);
    }
    let leaf_index = u32::from_be_bytes(idx_bytes);
    let siblings = read_siblings(env, asp_meta);
    let root = read_bytes32(env, asp_meta, 68 + ASP_TREE_DEPTH * 32);

    let mut rargs: SorobanVec<Val> = SorobanVec::new(env);
    rargs.push_back(root.clone().into_val(env));
    let known = env
        .try_invoke_contract::<bool, InvokeError>(&membership, &Symbol::new(env, "is_known_root"), rargs)
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or(false);
    if !known {
        return Err(Error::AspMembershipInvalid);
    }

    let mut vargs: SorobanVec<Val> = SorobanVec::new(env);
    vargs.push_back(owner_pk.clone().into_val(env));
    vargs.push_back(blinding.into_val(env));
    vargs.push_back(leaf_index.into_val(env));
    vargs.push_back(siblings.into_val(env));
    vargs.push_back(root.into_val(env));
    let ok = env
        .try_invoke_contract::<bool, InvokeError>(&membership, &Symbol::new(env, "verify_path"), vargs)
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or(false);
    if !ok {
        return Err(Error::AspMembershipInvalid);
    }

    if let Some(deny_addr) = deny {
        let mut dargs: SorobanVec<Val> = SorobanVec::new(env);
        dargs.push_back(owner_pk.clone().into_val(env));
        let denied = env
            .try_invoke_contract::<bool, InvokeError>(&deny_addr, &Symbol::new(env, "is_denied"), dargs)
            .ok()
            .and_then(|r| r.ok())
            .unwrap_or(false);
        if denied {
            return Err(Error::AspDenied);
        }
    }
    Ok(owner_pk)
}

fn verify_asp_proof(env: &Env, public_inputs: &Bytes, proof_bytes: &Bytes) -> Result<(), Error> {
    if proof_bytes.len() != PROOF_BYTES || public_inputs.len() != PUBLIC_INPUT_COUNT_ASP * 32 {
        return Err(Error::VerificationFailed);
    }
    let verifier: Address = env
        .storage()
        .instance()
        .get(&DataKey::VerifierAsp)
        .ok_or(Error::AspNotConfigured)?;
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(public_inputs.clone().into_val(env));
    args.push_back(proof_bytes.clone().into_val(env));
    env.try_invoke_contract::<(), InvokeError>(&verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| Error::VerificationFailed)?
        .map_err(|_| Error::VerificationFailed)?;
    Ok(())
}

#[contractimpl]
impl AspGate {
    pub fn __constructor(
        env: Env,
        owner: Address,
        pool: Address,
        asp_membership: Address,
        asp_deny: Address,
        verifier_asp: Address,
    ) {
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::AspMembership, &asp_membership);
        env.storage().instance().set(&DataKey::AspDeny, &asp_deny);
        env.storage().instance().set(&DataKey::VerifierAsp, &verifier_asp);
    }

    pub fn verify_shield_asp(env: Env, asp_meta: Bytes) -> Result<BytesN<32>, Error> {
        verify_asp_meta(&env, &asp_meta)
    }

    /// Compact ASP unshield: `proof_bundle` = proof || public_inputs (14×32);
    /// `meta` = nullifier || merkle_root || new_commitment || channel || subchannel || amount_be16
    /// || recipient_len || recipient || token_len || token || enc_len || encrypted_note.
    pub fn unshield_asp(env: Env, proof_bundle: Bytes, meta: Bytes) -> Result<(), Error> {
        if proof_bundle.len() != PROOF_BUNDLE_BYTES {
            return Err(Error::VerificationFailed);
        }
        let mut proof_arr = [0u8; PROOF_BYTES as usize];
        let mut inputs_arr = [0u8; (PUBLIC_INPUT_COUNT_ASP * 32) as usize];
        for i in 0..PROOF_BYTES {
            proof_arr[i as usize] = proof_bundle.get(i).unwrap_or(0);
        }
        for i in 0..PUBLIC_INPUT_COUNT_ASP * 32 {
            inputs_arr[i as usize] = proof_bundle.get(PROOF_BYTES + i).unwrap_or(0);
        }
        let proof_bytes = Bytes::from_array(&env, &proof_arr);
        let public_inputs = Bytes::from_array(&env, &inputs_arr);

        let asp_root = read_bytes32(&env, &public_inputs, 12 * 32);
        let owner_pk = read_bytes32(&env, &public_inputs, 13 * 32);

        let membership: Address = env
            .storage()
            .instance()
            .get(&DataKey::AspMembership)
            .ok_or(Error::AspNotConfigured)?;
        let mut rargs: SorobanVec<Val> = SorobanVec::new(&env);
        rargs.push_back(asp_root.clone().into_val(&env));
        if !env
            .try_invoke_contract::<bool, InvokeError>(&membership, &Symbol::new(&env, "is_known_root"), rargs)
            .ok()
            .and_then(|r| r.ok())
            .unwrap_or(false)
        {
            return Err(Error::AspMembershipInvalid);
        }

        if let Some(deny) = env.storage().instance().get::<DataKey, Address>(&DataKey::AspDeny) {
            let mut dargs: SorobanVec<Val> = SorobanVec::new(&env);
            dargs.push_back(owner_pk.clone().into_val(&env));
            if env
                .try_invoke_contract::<bool, InvokeError>(&deny, &Symbol::new(&env, "is_denied"), dargs)
                .ok()
                .and_then(|r| r.ok())
                .unwrap_or(false)
            {
                return Err(Error::AspDenied);
            }
        }

        verify_asp_proof(&env, &public_inputs, &proof_bytes)?;

        if meta.len() < META_FIXED_BYTES {
            return Err(Error::VerificationFailed);
        }
        let nullifier = read_bytes32(&env, &meta, 0);
        let merkle_root = read_bytes32(&env, &meta, 32);
        let new_commitment = read_bytes32(&env, &meta, 64);
        let channel = read_bytes32(&env, &meta, 96);
        let subchannel = read_bytes32(&env, &meta, 128);
        let mut amount_bytes = [0u8; 16];
        for i in 0..16u32 {
            amount_bytes[i as usize] = meta.get(160 + i).unwrap_or(0);
        }
        let amount = u128::from_be_bytes(amount_bytes);

        let mut offset = META_FIXED_BYTES;
        let recipient = read_address(&env, &meta, &mut offset)?;
        let token = read_address(&env, &meta, &mut offset)?;
        let enc_len = read_u32_be(&meta, offset);
        offset += 4;
        let mut enc_note = Bytes::new(&env);
        for i in 0..enc_len {
            enc_note.push_back(meta.get(offset + i).unwrap_or(0));
        }

        let pool: Address = env.storage().instance().get(&DataKey::Pool).unwrap();
        let gate = env.current_contract_address();
        let mut args: SorobanVec<Val> = SorobanVec::new(&env);
        args.push_back(gate.into_val(&env));
        args.push_back(nullifier.into_val(&env));
        args.push_back(token.into_val(&env));
        args.push_back(recipient.into_val(&env));
        args.push_back(amount.into_val(&env));
        args.push_back(merkle_root.into_val(&env));
        args.push_back(new_commitment.into_val(&env));
        args.push_back(enc_note.into_val(&env));
        args.push_back(channel.into_val(&env));
        args.push_back(subchannel.into_val(&env));
        env.try_invoke_contract::<(), InvokeError>(&pool, &Symbol::new(&env, "fulfill_unshield"), args)
            .map_err(|_| Error::PoolFailed)?
            .map_err(|_| Error::PoolFailed)?;
        Ok(())
    }
}

fn read_u32_be(data: &Bytes, offset: u32) -> u32 {
    let mut arr = [0u8; 4];
    for i in 0..4u32 {
        arr[i as usize] = data.get(offset + i).unwrap_or(0);
    }
    u32::from_be_bytes(arr)
}

fn read_address(env: &Env, data: &Bytes, offset: &mut u32) -> Result<Address, Error> {
    let len = read_u32_be(data, *offset) as usize;
    *offset += 4;
    if len == 0 || len > 128 {
        return Err(Error::VerificationFailed);
    }
    let mut arr = [0u8; 128];
    for i in 0..len {
        arr[i] = data.get(*offset + i as u32).unwrap_or(0);
    }
    *offset += len as u32;
    let s = core::str::from_utf8(&arr[..len]).map_err(|_| Error::VerificationFailed)?;
    Ok(Address::from_string(&String::from_str(env, s)))
}
