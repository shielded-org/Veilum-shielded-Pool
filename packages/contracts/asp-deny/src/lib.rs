#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Denied(BytesN<32>),
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotOwner = 1,
}

#[contract]
pub struct AspDeny;

#[contractimpl]
impl AspDeny {
    pub fn __constructor(env: Env, owner: Address) {
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    pub fn set_owner(env: Env, new_owner: Address) -> Result<(), Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        Ok(())
    }

    pub fn deny(env: Env, owner_pk: BytesN<32>) -> Result<(), Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().persistent().set(&DataKey::Denied(owner_pk), &true);
        Ok(())
    }

    pub fn undeny(env: Env, owner_pk: BytesN<32>) -> Result<(), Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().persistent().remove(&DataKey::Denied(owner_pk));
        Ok(())
    }

    pub fn is_denied(env: Env, owner_pk: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Denied(owner_pk))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn deny_and_undeny() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let contract_id = env.register(AspDeny, (owner.clone(),));
        let client = AspDenyClient::new(&env, &contract_id);

        let owner_pk = BytesN::from_array(&env, &[9u8; 32]);
        assert!(!client.is_denied(&owner_pk));
        client.deny(&owner_pk);
        assert!(client.is_denied(&owner_pk));
        client.undeny(&owner_pk);
        assert!(!client.is_denied(&owner_pk));
    }
}
