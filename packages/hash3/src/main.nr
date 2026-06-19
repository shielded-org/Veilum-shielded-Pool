use dep::poseidon::poseidon2::Poseidon2;

fn main(a: pub Field, b: pub Field, c: pub Field) -> pub Field {
    Poseidon2::hash([a, b, c], 3)
}
