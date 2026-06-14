use dep::poseidon::poseidon2::Poseidon2;

fn main(
    owner: pub Field,
    token: pub Field,
    amount: pub Field,
    blinding: pub Field,
) -> pub Field {
    Poseidon2::hash([owner, token, amount, blinding], 4)
}
