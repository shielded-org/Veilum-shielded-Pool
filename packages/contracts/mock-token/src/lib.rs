#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
    Allowance(Address, Address),
    TotalSupply,
    Symbol,
    Name,
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotAdmin = 1,
    InvalidAmount = 2,
    InsufficientBalance = 3,
    InsufficientAllowance = 4,
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn __constructor(
        env: Env,
        admin: Address,
        initial_holder: Address,
        initial_supply: i128,
        symbol: String,
        name: String,
    ) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &initial_supply);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Name, &name);
        if initial_supply > 0 {
            env.storage()
                .instance()
                .set(&DataKey::Balance(initial_holder), &initial_supply);
        }
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let bal: i128 = env.storage().instance().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Balance(to), &(bal + amount));
        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + amount));
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().instance().get(&DataKey::Balance(id)).unwrap_or(0)
    }

    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128) -> Result<(), Error> {
        owner.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Allowance(owner, spender), &amount);
        Ok(())
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        Self::transfer_internal(&env, &from, &to, amount)
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();
        let allowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Allowance(from.clone(), spender.clone()))
            .unwrap_or(0);
        if allowed < amount {
            return Err(Error::InsufficientAllowance);
        }
        env.storage().instance().set(
            &DataKey::Allowance(from.clone(), spender),
            &(allowed - amount),
        );
        Self::transfer_internal(&env, &from, &to, amount)
    }

    fn transfer_internal(env: &Env, from: &Address, to: &Address, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let from_bal: i128 = env.storage().instance().get(&DataKey::Balance(from.clone())).unwrap_or(0);
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        env.storage()
            .instance()
            .set(&DataKey::Balance(from.clone()), &(from_bal - amount));
        let to_bal: i128 = env.storage().instance().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Balance(to.clone()), &(to_bal + amount));
        Ok(())
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or(String::from_str(&env, "MOCK"))
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or(String::from_str(&env, "Mock Token"))
    }
}
