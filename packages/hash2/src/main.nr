use dep::poseidon::poseidon2::Poseidon2;

fn main(left: pub Field, right: pub Field) -> pub Field {
    Poseidon2::hash([left, right], 2)
}
