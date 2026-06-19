#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    InvokeError, Symbol, Val, Vec as SorobanVec,
};
use soroban_sdk::IntoVal;

const PUBLIC_INPUT_COUNT: u32 = 12;
const PROOF_BYTES: u32 = 456 * 32;
const TRANSFER_META_BYTES: u32 = 32 * 8;
const ASP_TREE_DEPTH: u32 = 10;
const ASP_META_BYTES: u32 = 32 + 32 + 4 + ASP_TREE_DEPTH * 32 + 32;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Verifier,
    MerkleTree,
    AspMembership,
    AspDeny,
    VerifierAsp,
    AspEnforceShield,
    AspGate,
    EnabledToken(Address),
    TokenFieldFor(Address),
    TokenByField(BytesN<32>),
    Nullifier(BytesN<32>),
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    InvalidRoot = 1,
    InvalidProof = 2,
    InvalidTokenField = 3,
    InvalidToken = 4,
    InvalidRecipient = 5,
    InvalidAmount = 6,
    InvalidCommitment = 7,
    InvalidNullifier = 8,
    DuplicateNullifiers = 9,
    NullifierAlreadySpent = 10,
    VerificationFailed = 11,
    NotOwner = 12,
    TokenNotEnabled = 13,
    TokenTransferFailed = 14,
    AspMembershipInvalid = 15,
    NotAspGate = 16,
}

#[contracttype]
#[derive(Clone)]
pub struct RoutedNote {
    pub channel: BytesN<32>,
    pub subchannel: BytesN<32>,
    pub encrypted_note: Bytes,
}

#[contract]
pub struct ShieldedPool;

pub fn token_field_from_token(env: &Env, token: &Address) -> BytesN<32> {
    let digest: BytesN<32> = env.crypto().sha256(&token.to_string().to_bytes()).into();
    let mut arr = [0u8; 32];
    digest.copy_into_slice(&mut arr);
    arr[0] = 0;
    BytesN::from_array(env, &arr)
}

fn merkle_insert(env: &Env, tree: &Address, leaf: &BytesN<32>) {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(leaf.clone().into_val(env));
    let _ = env.try_invoke_contract::<u32, InvokeError>(tree, &Symbol::new(env, "insert"), args);
}

fn merkle_is_known_root(env: &Env, tree: &Address, root: &BytesN<32>) -> bool {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(root.clone().into_val(env));
    env.try_invoke_contract::<bool, InvokeError>(tree, &Symbol::new(env, "is_known_root"), args)
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or(false)
}

fn read_bytes32(env: &Env, meta: &Bytes, offset: u32) -> BytesN<32> {
    let mut arr = [0u8; 32];
    for i in 0..32u32 {
        arr[i as usize] = meta.get(offset + i).unwrap_or(0);
    }
    BytesN::from_array(env, &arr)
}

fn verify_proof(
    env: &Env,
    verifier: &Address,
    public_inputs: Bytes,
    proof_bytes: Bytes,
) -> Result<(), Error> {
    if proof_bytes.len() != PROOF_BYTES {
        return Err(Error::InvalidProof);
    }
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(public_inputs.into_val(env));
    args.push_back(proof_bytes.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| Error::VerificationFailed)?
        .map_err(|_| Error::VerificationFailed)?;
    Ok(())
}

fn build_public_inputs_transfer(
    env: &Env,
    token: &BytesN<32>,
    merkle_root: &BytesN<32>,
    nullifiers: &[BytesN<32>; 2],
    new_commitments: &[BytesN<32>; 2],
    fee: u128,
    fee_recipient_pk: &BytesN<32>,
) -> Bytes {
    let mut out = [0u8; (PUBLIC_INPUT_COUNT * 32) as usize];
    let fields: [&BytesN<32>; 12] = [
        token,
        merkle_root,
        &nullifiers[0],
        &nullifiers[1],
        &new_commitments[0],
        &new_commitments[1],
        &u128_to_bytes32(env, fee),
        fee_recipient_pk,
        &u128_to_bytes32(env, 0),
        &zero_bytes32(env),
        &zero_bytes32(env),
        &zero_bytes32(env),
    ];
    for (i, field) in fields.iter().enumerate() {
        let mut slice = [0u8; 32];
        field.copy_into_slice(&mut slice);
        out[i * 32..(i + 1) * 32].copy_from_slice(&slice);
    }
    Bytes::from_array(env, &out)
}

fn build_public_inputs_unshield(
    env: &Env,
    token: &BytesN<32>,
    merkle_root: &BytesN<32>,
    nullifier: &BytesN<32>,
    new_commitment: &BytesN<32>,
    recipient: &Address,
    amount: u128,
) -> Bytes {
    let recipient_field = address_to_field_bytes(env, recipient);
    let mut out = [0u8; (PUBLIC_INPUT_COUNT * 32) as usize];
    let mode = u128_to_bytes32(env, 1);
    let fields: [&BytesN<32>; 12] = [
        token,
        merkle_root,
        nullifier,
        &zero_bytes32(env),
        new_commitment,
        &zero_bytes32(env),
        &zero_bytes32(env),
        &zero_bytes32(env),
        &mode,
        &recipient_field,
        &u128_to_bytes32(env, amount),
        token,
    ];
    for (i, field) in fields.iter().enumerate() {
        let mut slice = [0u8; 32];
        field.copy_into_slice(&mut slice);
        out[i * 32..(i + 1) * 32].copy_from_slice(&slice);
    }
    Bytes::from_array(env, &out)
}

fn address_to_field_bytes(env: &Env, addr: &Address) -> BytesN<32> {
    let digest: BytesN<32> = env.crypto().sha256(&addr.to_string().to_bytes()).into();
    let mut arr = [0u8; 32];
    digest.copy_into_slice(&mut arr);
    arr[0] = 0;
    BytesN::from_array(env, &arr)
}

fn zero_bytes32(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn u128_to_bytes32(env: &Env, value: u128) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[16..32].copy_from_slice(&value.to_be_bytes());
    BytesN::from_array(env, &arr)
}

fn token_from_field(env: &Env, field: &BytesN<32>) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::TokenByField(field.clone()))
        .ok_or(Error::InvalidTokenField)
}

fn check_and_mark_nullifier(env: &Env, nullifier: &BytesN<32>) -> Result<(), Error> {
    if nullifier == &zero_bytes32(env) {
        return Err(Error::InvalidNullifier);
    }
    let key = DataKey::Nullifier(nullifier.clone());
    if env.storage().persistent().get(&key).unwrap_or(false) {
        return Err(Error::NullifierAlreadySpent);
    }
    env.storage().persistent().set(&key, &true);
    Ok(())
}

fn is_token_enabled(env: &Env, token: &Address) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::EnabledToken(token.clone()))
        .unwrap_or(false)
}

#[contractimpl]
impl ShieldedPool {
    pub fn __constructor(env: Env, owner: Address, verifier: Address, merkle_tree: Address) {
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::MerkleTree, &merkle_tree);
    }

    pub fn set_token_enabled(env: Env, token: Address, enabled: bool) -> Result<(), Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        if enabled {
            Self::enable_token_internal(&env, &token);
        } else {
            env.storage()
                .instance()
                .set(&DataKey::EnabledToken(token.clone()), &false);
        }
        Ok(())
    }

    fn enable_token_internal(env: &Env, token: &Address) {
        let field = token_field_from_token(env, token);
        env.storage()
            .instance()
            .set(&DataKey::EnabledToken(token.clone()), &true);
        env.storage()
            .instance()
            .set(&DataKey::TokenFieldFor(token.clone()), &field);
        env.storage()
            .instance()
            .set(&DataKey::TokenByField(field), token);
    }

    pub fn token_field(env: Env, token: Address) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::TokenFieldFor(token.clone()))
            .unwrap_or_else(|| token_field_from_token(&env, &token))
    }

    pub fn nullifier_spent(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Nullifier(nullifier))
            .unwrap_or(false)
    }

    pub fn configure_asp(env: Env, asp_membership: Address, asp_deny: Address, verifier_asp: Address, asp_gate: Address, enforce_shield: bool) -> Result<(), Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().set(&DataKey::AspMembership, &asp_membership);
        env.storage().instance().set(&DataKey::AspDeny, &asp_deny);
        env.storage().instance().set(&DataKey::VerifierAsp, &verifier_asp);
        env.storage().instance().set(&DataKey::AspGate, &asp_gate);
        env.storage().instance().set(&DataKey::AspEnforceShield, &enforce_shield);
        Ok(())
    }

    pub fn shield_routed(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
        commitment: BytesN<32>,
        encrypted_note: Bytes,
        channel: BytesN<32>,
        subchannel: BytesN<32>,
        asp_meta: Bytes,
    ) -> Result<(), Error> {
        let enforce: bool = env.storage().instance().get(&DataKey::AspEnforceShield).unwrap_or(false);
        if enforce {
            if asp_meta.len() != ASP_META_BYTES {
                return Err(Error::AspMembershipInvalid);
            }
            let asp: Address = env.storage().instance().get(&DataKey::AspMembership).ok_or(Error::AspMembershipInvalid)?;
            let owner_pk = read_bytes32(&env, &asp_meta, 0);
            let blinding = read_bytes32(&env, &asp_meta, 32);
            let mut idx_bytes = [0u8; 4];
            for i in 0..4u32 {
                idx_bytes[i as usize] = asp_meta.get(64 + i).unwrap_or(0);
            }
            let leaf_index = u32::from_be_bytes(idx_bytes);
            let root = read_bytes32(&env, &asp_meta, 68 + ASP_TREE_DEPTH * 32);
            let mut siblings: SorobanVec<BytesN<32>> = SorobanVec::new(&env);
            for level in 0..ASP_TREE_DEPTH {
                let mut arr = [0u8; 32];
                for i in 0..32u32 {
                    arr[i as usize] = asp_meta.get(68 + level * 32 + i).unwrap_or(0);
                }
                siblings.push_back(BytesN::from_array(&env, &arr));
            }
            let mut vargs: SorobanVec<Val> = SorobanVec::new(&env);
            vargs.push_back(owner_pk.clone().into_val(&env));
            vargs.push_back(blinding.into_val(&env));
            vargs.push_back(leaf_index.into_val(&env));
            vargs.push_back(siblings.into_val(&env));
            vargs.push_back(root.clone().into_val(&env));
            let ok = env
                .try_invoke_contract::<bool, InvokeError>(&asp, &Symbol::new(&env, "verify_path"), vargs)
                .ok()
                .and_then(|r| r.ok())
                .unwrap_or(false);
            if !ok {
                return Err(Error::AspMembershipInvalid);
            }
            if let Some(deny) = env.storage().instance().get::<DataKey, Address>(&DataKey::AspDeny) {
                let mut dargs: SorobanVec<Val> = SorobanVec::new(&env);
                dargs.push_back(owner_pk.into_val(&env));
                if env
                    .try_invoke_contract::<bool, InvokeError>(&deny, &Symbol::new(&env, "is_denied"), dargs)
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or(false)
                {
                    return Err(Error::AspMembershipInvalid);
                }
            }
        } else if asp_meta.len() != 0 {
            return Err(Error::AspMembershipInvalid);
        }
        caller.require_auth();
        if !is_token_enabled(&env, &token) {
            return Err(Error::TokenNotEnabled);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if commitment == zero_bytes32(&env) {
            return Err(Error::InvalidCommitment);
        }

        let pool = env.current_contract_address();
        token_transfer_from(&env, &token, &pool, &caller, &pool, amount)?;

        let tree: Address = env.storage().instance().get(&DataKey::MerkleTree).unwrap();
        merkle_insert(&env, &tree, &commitment);

        publish_routed_note(&env, &channel, &subchannel, &encrypted_note);
        Ok(())
    }

    pub fn shielded_transfer_routed(
        env: Env,
        proof_bytes: Bytes,
        transfer_meta: Bytes,
        encrypted_note0: Bytes,
        encrypted_note1: Bytes,
        channel0: BytesN<32>,
        channel1: BytesN<32>,
        subchannel0: BytesN<32>,
        subchannel1: BytesN<32>,
        fee: u128,
    ) -> Result<(), Error> {
        if transfer_meta.len() != TRANSFER_META_BYTES {
            return Err(Error::InvalidCommitment);
        }
        let nullifier0 = read_bytes32(&env, &transfer_meta, 0);
        let nullifier1 = read_bytes32(&env, &transfer_meta, 32);
        let new_commitment0 = read_bytes32(&env, &transfer_meta, 64);
        let new_commitment1 = read_bytes32(&env, &transfer_meta, 96);
        let merkle_root = read_bytes32(&env, &transfer_meta, 128);
        let token_field = read_bytes32(&env, &transfer_meta, 160);
        let fee_recipient_pk = read_bytes32(&env, &transfer_meta, 192);

        let token = token_from_field(&env, &token_field)?;
        if !is_token_enabled(&env, &token) {
            return Err(Error::TokenNotEnabled);
        }

        let nullifiers_arr = [nullifier0, nullifier1];
        let new_commitments_arr = [new_commitment0, new_commitment1];

        if nullifiers_arr[0] == zero_bytes32(&env) {
            return Err(Error::InvalidNullifier);
        }
        if nullifiers_arr[1] != zero_bytes32(&env) && nullifiers_arr[0] == nullifiers_arr[1] {
            return Err(Error::DuplicateNullifiers);
        }
        if new_commitments_arr[0] == zero_bytes32(&env) || new_commitments_arr[1] == zero_bytes32(&env)
        {
            return Err(Error::InvalidCommitment);
        }

        let tree: Address = env.storage().instance().get(&DataKey::MerkleTree).unwrap();
        if !merkle_is_known_root(&env, &tree, &merkle_root) {
            return Err(Error::InvalidRoot);
        }

        let public_inputs = build_public_inputs_transfer(
            &env,
            &token_field,
            &merkle_root,
            &nullifiers_arr,
            &new_commitments_arr,
            fee,
            &fee_recipient_pk,
        );
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        verify_proof(&env, &verifier, public_inputs, proof_bytes)?;

        check_and_mark_nullifier(&env, &nullifiers_arr[0])?;
        if nullifiers_arr[1] != zero_bytes32(&env) {
            check_and_mark_nullifier(&env, &nullifiers_arr[1])?;
        }

        merkle_insert(&env, &tree, &new_commitments_arr[0]);
        merkle_insert(&env, &tree, &new_commitments_arr[1]);

        publish_routed_note(&env, &channel0, &subchannel0, &encrypted_note0);
        publish_routed_note(&env, &channel1, &subchannel1, &encrypted_note1);
        Ok(())
    }

    pub fn unshield(
        env: Env,
        proof_bytes: Bytes,
        nullifier: BytesN<32>,
        token: Address,
        recipient: Address,
        amount: u128,
        merkle_root: BytesN<32>,
        new_commitment: BytesN<32>,
        encrypted_note: Bytes,
        channel: BytesN<32>,
        subchannel: BytesN<32>,
    ) -> Result<(), Error> {
        if !is_token_enabled(&env, &token) {
            return Err(Error::TokenNotEnabled);
        }
        if amount == 0 {
            return Err(Error::InvalidAmount);
        }
        if nullifier == zero_bytes32(&env) {
            return Err(Error::InvalidNullifier);
        }

        let token_field = token_field_from_token(&env, &token);
        let tree: Address = env.storage().instance().get(&DataKey::MerkleTree).unwrap();
        if !merkle_is_known_root(&env, &tree, &merkle_root) {
            return Err(Error::InvalidRoot);
        }

        let public_inputs = build_public_inputs_unshield(
            &env,
            &token_field,
            &merkle_root,
            &nullifier,
            &new_commitment,
            &recipient,
            amount,
        );
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        verify_proof(&env, &verifier, public_inputs, proof_bytes)?;

        check_and_mark_nullifier(&env, &nullifier)?;

        if new_commitment != zero_bytes32(&env) {
            merkle_insert(&env, &tree, &new_commitment);
            publish_routed_note(&env, &channel, &subchannel, &encrypted_note);
        }

        let pool = env.current_contract_address();
        token_transfer(&env, &token, &pool, &recipient, amount as i128)?;
        Ok(())
    }

    pub fn fulfill_unshield(
        env: Env,
        gate: Address,
        nullifier: BytesN<32>,
        token: Address,
        recipient: Address,
        amount: u128,
        merkle_root: BytesN<32>,
        new_commitment: BytesN<32>,
        encrypted_note: Bytes,
        channel: BytesN<32>,
        subchannel: BytesN<32>,
    ) -> Result<(), Error> {
        let expected: Address = env.storage().instance().get(&DataKey::AspGate).ok_or(Error::NotAspGate)?;
        if gate != expected {
            return Err(Error::NotAspGate);
        }
        gate.require_auth();
        if !is_token_enabled(&env, &token) {
            return Err(Error::TokenNotEnabled);
        }
        if amount == 0 {
            return Err(Error::InvalidAmount);
        }
        if nullifier == zero_bytes32(&env) {
            return Err(Error::InvalidNullifier);
        }
        let tree: Address = env.storage().instance().get(&DataKey::MerkleTree).unwrap();
        if !merkle_is_known_root(&env, &tree, &merkle_root) {
            return Err(Error::InvalidRoot);
        }
        check_and_mark_nullifier(&env, &nullifier)?;
        if new_commitment != zero_bytes32(&env) {
            merkle_insert(&env, &tree, &new_commitment);
            publish_routed_note(&env, &channel, &subchannel, &encrypted_note);
        }
        let pool = env.current_contract_address();
        token_transfer(&env, &token, &pool, &recipient, amount as i128)?;
        Ok(())
    }
}

fn publish_routed_note(
    env: &Env,
    channel: &BytesN<32>,
    subchannel: &BytesN<32>,
    encrypted_note: &Bytes,
) {
    if encrypted_note.len() == 0 {
        return;
    }
    env.events().publish(
        (symbol_short!("route"), channel.clone(), subchannel.clone()),
        encrypted_note.clone(),
    );
}

fn token_transfer_from(
    env: &Env,
    token: &Address,
    spender: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), Error> {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(spender.clone().into_val(env));
    args.push_back(from.clone().into_val(env));
    args.push_back(to.clone().into_val(env));
    args.push_back(amount.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(token, &Symbol::new(env, "transfer_from"), args)
        .map_err(|_| Error::TokenTransferFailed)?
        .map_err(|_| Error::TokenTransferFailed)?;
    Ok(())
}

fn token_transfer(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) -> Result<(), Error> {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(from.clone().into_val(env));
    args.push_back(to.clone().into_val(env));
    args.push_back(amount.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(token, &Symbol::new(env, "transfer"), args)
        .map_err(|_| Error::TokenTransferFailed)?
        .map_err(|_| Error::TokenTransferFailed)?;
    Ok(())
}
