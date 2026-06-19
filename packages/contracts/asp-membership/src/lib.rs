#![no_std]
use soroban_poseidon::poseidon2_hash;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, crypto::BnScalar, panic_with_error, Bytes,
    BytesN, Env, U256, Vec,
};

pub const ROOT_HISTORY_SIZE: u32 = 30;
pub const TREE_DEPTH: u32 = 10;
pub const MAX_LEAVES: u32 = 1 << TREE_DEPTH;
/// Domain separator for ASP membership leaves (matches circuit + SDK).
pub const ASP_MEMBERSHIP_DOMAIN: u32 = 2;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    CurrentRoot,
    RootHistory(u32),
    RootPointer,
    KnownRoot(BytesN<32>),
    Zeros(u32),
    FilledSubtrees(u32),
    NextIndex,
    LeafOwner(u32),
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    TreeFull = 1,
    NotOwner = 2,
    InvalidPath = 3,
    InvalidSiblings = 4,
}

#[contract]
pub struct AspMembership;

fn u256_from_bytes32(env: &Env, bytes: &BytesN<32>) -> U256 {
    let mut arr = [0u8; 32];
    bytes.copy_into_slice(&mut arr);
    U256::from_be_bytes(env, &Bytes::from_array(env, &arr))
}

fn bytes32_from_u256(env: &Env, value: &U256) -> BytesN<32> {
    let bytes = value.to_be_bytes();
    let mut arr = [0u8; 32];
    for i in 0..32u32 {
        arr[i as usize] = bytes.get(i).unwrap_or(0);
    }
    BytesN::from_array(env, &arr)
}

fn hash2(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let inputs = Vec::from_array(
        env,
        [
            u256_from_bytes32(env, left),
            u256_from_bytes32(env, right),
        ],
    );
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    bytes32_from_u256(env, &out)
}

fn hash3(env: &Env, a: &BytesN<32>, b: &BytesN<32>, c: &BytesN<32>) -> BytesN<32> {
    let inputs = Vec::from_array(
        env,
        [
            u256_from_bytes32(env, a),
            u256_from_bytes32(env, b),
            u256_from_bytes32(env, c),
        ],
    );
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    bytes32_from_u256(env, &out)
}

fn domain_bytes32(env: &Env) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[31] = ASP_MEMBERSHIP_DOMAIN as u8;
    BytesN::from_array(env, &arr)
}

fn zero_bytes(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn verify_merkle_path(
    env: &Env,
    leaf: &BytesN<32>,
    leaf_index: u32,
    siblings: &Vec<BytesN<32>>,
    root: &BytesN<32>,
) -> bool {
    if siblings.len() != TREE_DEPTH {
        return false;
    }
    let mut acc = leaf.clone();
    let mut idx = leaf_index;
    for level in 0..TREE_DEPTH {
        let sibling = siblings.get(level).unwrap();
        if (idx & 1) == 0 {
            acc = hash2(env, &acc, &sibling);
        } else {
            acc = hash2(env, &sibling, &acc);
        }
        idx >>= 1;
    }
    acc == *root
}

#[contractimpl]
impl AspMembership {
    pub fn __constructor(env: Env, owner: soroban_sdk::Address) {
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
        let zero = zero_bytes(&env);
        let mut current_zero = zero.clone();
        for level in 0..TREE_DEPTH {
            env.storage().instance().set(&DataKey::Zeros(level), &current_zero);
            env.storage()
                .instance()
                .set(&DataKey::FilledSubtrees(level), &zero);
            current_zero = hash2(&env, &current_zero, &current_zero);
        }
        env.storage()
            .instance()
            .set(&DataKey::CurrentRoot, &current_zero);
        Self::remember_root(&env, &current_zero);
        env.storage().instance().set(&DataKey::NextIndex, &0u32);
    }

    pub fn set_owner(env: Env, new_owner: soroban_sdk::Address) -> Result<(), Error> {
        let owner: soroban_sdk::Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        Ok(())
    }

    pub fn membership_leaf(env: Env, owner_pk: BytesN<32>, membership_blinding: BytesN<32>) -> BytesN<32> {
        hash3(&env, &owner_pk, &membership_blinding, &domain_bytes32(&env))
    }

    pub fn insert_member(
        env: Env,
        owner_pk: BytesN<32>,
        membership_blinding: BytesN<32>,
    ) -> Result<u32, Error> {
        let owner: soroban_sdk::Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        let leaf = Self::membership_leaf(env.clone(), owner_pk.clone(), membership_blinding);
        let idx = Self::try_insert(env.clone(), leaf)?;
        env.storage().instance().set(&DataKey::LeafOwner(idx), &owner_pk);
        Ok(idx)
    }

    pub fn insert(env: Env, leaf: BytesN<32>) -> u32 {
        Self::try_insert(env.clone(), leaf).unwrap_or_else(|e| panic_with_error!(&env, e))
    }

    fn try_insert(env: Env, leaf: BytesN<32>) -> Result<u32, Error> {
        let next_index: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextIndex)
            .unwrap_or(0);
        if next_index >= MAX_LEAVES {
            return Err(Error::TreeFull);
        }

        let mut index = next_index;
        let mut current_hash = leaf;
        for level in 0..TREE_DEPTH {
            if (index & 1) == 0 {
                env.storage()
                    .instance()
                    .set(&DataKey::FilledSubtrees(level), &current_hash);
                let zero: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&DataKey::Zeros(level))
                    .unwrap();
                current_hash = hash2(&env, &current_hash, &zero);
            } else {
                let left: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&DataKey::FilledSubtrees(level))
                    .unwrap();
                current_hash = hash2(&env, &left, &current_hash);
            }
            index >>= 1;
        }

        env.storage()
            .instance()
            .set(&DataKey::NextIndex, &(next_index + 1));
        env.storage()
            .instance()
            .set(&DataKey::CurrentRoot, &current_hash);
        Self::remember_root(&env, &current_hash);
        Ok(next_index)
    }

    pub fn verify_path(
        env: Env,
        owner_pk: BytesN<32>,
        membership_blinding: BytesN<32>,
        leaf_index: u32,
        siblings: Vec<BytesN<32>>,
        root: BytesN<32>,
    ) -> bool {
        if siblings.len() != TREE_DEPTH {
            return false;
        }
        if !Self::is_known_root(env.clone(), root.clone()) {
            return false;
        }
        let leaf = Self::membership_leaf(env.clone(), owner_pk, membership_blinding);
        verify_merkle_path(&env, &leaf, leaf_index, &siblings, &root)
    }

    pub fn get_last_root(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::CurrentRoot)
            .unwrap_or_else(|| zero_bytes(&env))
    }

    pub fn is_known_root(env: Env, root: BytesN<32>) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::KnownRoot(root))
            .unwrap_or(false)
    }

    pub fn get_next_index(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextIndex)
            .unwrap_or(0)
    }

    pub fn hash2(env: Env, left: BytesN<32>, right: BytesN<32>) -> BytesN<32> {
        hash2(&env, &left, &right)
    }

    pub fn hash3(env: Env, a: BytesN<32>, b: BytesN<32>, c: BytesN<32>) -> BytesN<32> {
        hash3(&env, &a, &b, &c)
    }

    fn remember_root(env: &Env, new_root: &BytesN<32>) {
        let pointer: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RootPointer)
            .unwrap_or(0);
        if let Some(previous) = env
            .storage()
            .instance()
            .get::<DataKey, BytesN<32>>(&DataKey::RootHistory(pointer))
        {
            env.storage()
                .instance()
                .set(&DataKey::KnownRoot(previous), &false);
        }
        env.storage()
            .instance()
            .set(&DataKey::RootHistory(pointer), new_root);
        env.storage()
            .instance()
            .set(&DataKey::KnownRoot(new_root.clone()), &true);
        let next_pointer = (pointer + 1) % ROOT_HISTORY_SIZE;
        env.storage()
            .instance()
            .set(&DataKey::RootPointer, &next_pointer);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn inserts_and_verifies_path() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let contract_id = env.register(AspMembership, (owner.clone(),));
        let client = AspMembershipClient::new(&env, &contract_id);

        let owner_pk = BytesN::from_array(&env, &[3u8; 32]);
        let blinding = BytesN::from_array(&env, &[4u8; 32]);
        let idx = client.insert_member(&owner_pk, &blinding);
        assert_eq!(idx, 0);
        let root = client.get_last_root();
        assert!(client.is_known_root(&root));

        let leaf = client.membership_leaf(&owner_pk, &blinding);
        let siblings = Vec::from_array(
            &env,
            [
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
                zero_bytes(&env),
            ],
        );
        assert!(client.verify_path(&owner_pk, &blinding, &idx, &siblings, &root));
        assert_eq!(leaf, client.membership_leaf(&owner_pk, &blinding));
    }
}
