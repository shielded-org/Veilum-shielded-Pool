#![no_std]
use soroban_poseidon::poseidon2_hash;
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, crypto::BnScalar, panic_with_error, Bytes, BytesN, Env, U256, Vec};

pub const ROOT_HISTORY_SIZE: u32 = 30;
pub const TREE_DEPTH: u32 = 20;
pub const MAX_LEAVES: u32 = 1 << TREE_DEPTH;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    CurrentRoot,
    RootHistory(u32),
    RootPointer,
    KnownRoot(BytesN<32>),
    Zeros(u32),
    FilledSubtrees(u32),
    NextIndex,
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    TreeFull = 1,
}

#[contract]
pub struct IncrementalMerkleTree;

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

fn zero_bytes(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

#[contractimpl]
impl IncrementalMerkleTree {
    pub fn __constructor(env: Env) {
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

    pub fn insert(env: Env, leaf: BytesN<32>) -> u32 {
        match Self::try_insert(env.clone(), leaf) {
            Ok(idx) => idx,
            Err(Error::TreeFull) => panic_with_error!(&env, Error::TreeFull),
        }
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
    fn inserts_and_tracks_roots() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(IncrementalMerkleTree, ());
        let client = IncrementalMerkleTreeClient::new(&env, &contract_id);

        let leaf = BytesN::from_array(&env, &[7u8; 32]);
        let idx = client.insert(&leaf);
        assert_eq!(idx, 0);
        let root = client.get_last_root();
        assert!(client.is_known_root(&root));
        assert_eq!(client.get_next_index(), 1);
    }
}
