use dep::poseidon::poseidon2::Poseidon2;

fn poseidon2_hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn poseidon2_hash3(a: Field, b: Field, c: Field) -> Field {
    Poseidon2::hash([a, b, c], 3)
}

fn poseidon2_hash4(a: Field, b: Field, c: Field, d: Field) -> Field {
    Poseidon2::hash([a, b, c, d], 4)
}

struct Note {
    owner: Field,
    token: Field,
    amount: Field,
    blinding: Field,
}

fn hash_note(note: Note) -> Field {
    poseidon2_hash4(note.owner, note.token, note.amount, note.blinding)
}

fn hash_nullifier(spending_key: Field, commitment: Field) -> Field {
    poseidon2_hash2(spending_key, commitment)
}

fn merkle_parent(left: Field, right: Field) -> Field {
    poseidon2_hash2(left, right)
}

fn verify_merkle_path(leaf: Field, siblings: [Field; 20], directions: [bool; 20], root: Field) -> bool {
    let mut acc = leaf;
    for i in 0..20 {
        if directions[i] {
            acc = merkle_parent(siblings[i], acc);
        } else {
            acc = merkle_parent(acc, siblings[i]);
        }
    }
    acc == root
}

fn verify_asp_path(leaf: Field, siblings: [Field; 10], directions: [bool; 10], root: Field) -> bool {
    let mut acc = leaf;
    for i in 0..10 {
        if directions[i] {
            acc = merkle_parent(siblings[i], acc);
        } else {
            acc = merkle_parent(acc, siblings[i]);
        }
    }
    acc == root
}

fn main(
    spending_key: Field,
    in_amounts: [Field; 2],
    in_blindings: [Field; 2],
    merkle_siblings: [[Field; 20]; 2],
    merkle_directions: [[bool; 20]; 2],
    out_amounts: [Field; 2],
    out_recipient_pks: [Field; 2],
    out_blindings: [Field; 2],
    membership_blinding: Field,
    asp_merkle_siblings: [Field; 10],
    asp_merkle_directions: [bool; 10],
    token: pub Field,
    merkle_root: pub Field,
    nullifiers: pub [Field; 2],
    out_commitments: pub [Field; 2],
    fee: pub Field,
    fee_recipient_pk: pub Field,
    mode: pub Field,
    unshield_recipient: pub Field,
    unshield_amount: pub Field,
    unshield_token_address: pub Field,
    asp_membership_root: pub Field,
    owner_pk_public: pub Field,
) {
    let owner_pk = poseidon2_hash2(spending_key, 1);
    assert(owner_pk == owner_pk_public);

    let asp_leaf = poseidon2_hash3(owner_pk, membership_blinding, 2);
    assert((if verify_asp_path(asp_leaf, asp_merkle_siblings, asp_merkle_directions, asp_membership_root) { 1 } else { 0 } - 1) * mode == 0);

    let use_second_input = if nullifiers[1] == 0 { 0 } else { 1 };

    for i in 0..2 {
        let in_note = Note {
            owner: owner_pk,
            token,
            amount: in_amounts[i],
            blinding: in_blindings[i],
        };
        let input_commitment = hash_note(in_note);
        let should_validate_input = if i == 0 { 1 } else { (1 - mode) * use_second_input };
        assert((if verify_merkle_path(input_commitment, merkle_siblings[i], merkle_directions[i], merkle_root) { 1 } else { 0 } - 1) * should_validate_input == 0);

        let expected_nf = hash_nullifier(spending_key, input_commitment);
        assert((expected_nf - nullifiers[i]) * should_validate_input == 0);

        let out_note = Note {
            owner: out_recipient_pks[i],
            token,
            amount: out_amounts[i],
            blinding: out_blindings[i],
        };
        let expected_out = hash_note(out_note);
        let should_validate_output = if i == 0 { 1 } else { 1 - mode };
        assert((out_commitments[i] - expected_out) * should_validate_output == 0);
    }

    assert(mode * (mode - 1) == 0);

    assert((in_amounts[0] + in_amounts[1] - (out_amounts[0] + out_amounts[1])) * (1 - mode) == 0);

    assert(fee * (1 - mode) == 0);
    assert(fee_recipient_pk * (1 - mode) == 0);
    assert(in_amounts[1] * (1 - mode) * (1 - use_second_input) == 0);
    assert(in_blindings[1] * (1 - mode) * (1 - use_second_input) == 0);
    assert(out_recipient_pks[1] * (1 - mode) + mode != 0);

    assert(in_amounts[1] * mode == 0);
    assert(in_blindings[1] * mode == 0);
    assert(nullifiers[1] * mode == 0);
    assert(out_amounts[1] * mode == 0);
    assert(out_recipient_pks[1] * mode == 0);
    assert(out_blindings[1] * mode == 0);
    assert(out_commitments[1] * mode == 0);
    assert(fee * mode == 0);
    assert(fee_recipient_pk * mode == 0);

    assert((in_amounts[0] - (unshield_amount + out_amounts[0])) * mode == 0);
    assert((token - unshield_token_address) * mode == 0);
    assert(unshield_recipient * mode + (1 - mode) != 0);
}
