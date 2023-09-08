pub use switchboard_solana::get_ixn_discriminator;
pub use switchboard_solana::prelude::*;
mod params;
use bytemuck;
pub use params::*;
use std::str::FromStr;

#[tokio::main(worker_threads = 12)]
async fn main() {
    // First, initialize the runner instance with a freshly generated Gramine keypair
    let runner = FunctionRunner::new_from_cluster(Cluster::Devnet, None).unwrap();

    // parse and validate user provided request params
    let function_request_data = runner.function_request_data.as_ref().unwrap();
    let params = ContainerParams::decode(&function_request_data.container_params).unwrap();

    // Determine the final result
    let mut bytes: [u8; 4] = [0u8; 4];
    Gramine::read_rand(&mut bytes).expect("gramine failed to generate randomness");
    let raw_result: &[u32] = bytemuck::cast_slice(&bytes[..]);
    let result = raw_result[0] % 2;
    let mut result_bytes = result.to_le_bytes().try_to_vec().unwrap();

    // derive pubkeys to build ixn
    let (house_pubkey, _house_bump) =
        Pubkey::find_program_address(&[b"HOUSESEED"], &params.program_id);
    let house_vault =
        anchor_spl::associated_token::get_associated_token_address(&house_pubkey, &params.mint_key);

    // Then, write your own Rust logic and build a Vec of instructions.
    // Should  be under 700 bytes after serialization
    let mut ixn_data = get_ixn_discriminator("user_settle").to_vec();
    ixn_data.append(&mut result_bytes);

    let ixs: Vec<solana_program::instruction::Instruction> = vec![Instruction {
        program_id: params.program_id,
        accounts: vec![
            AccountMeta::new(params.user_key, false),
            AccountMeta::new_readonly(house_pubkey, false),
            AccountMeta::new(params.escrow_key, false),
            AccountMeta::new(params.reward_key, false),
            AccountMeta::new(house_vault, false),
            AccountMeta::new_readonly(runner.function, false),
            AccountMeta::new_readonly(runner.function_request_key.unwrap(), false),
            AccountMeta::new_readonly(runner.signer, true),
            AccountMeta::new_readonly(anchor_spl::token::ID, false),
        ],
        data: ixn_data,
    }];

    // Finally, emit the signed quote and partially signed transaction to the functionRunner oracle
    // The functionRunner oracle will use the last outputted word to stdout as the serialized result. This is what gets executed on-chain.
    runner.emit(ixs).await.unwrap();
}
