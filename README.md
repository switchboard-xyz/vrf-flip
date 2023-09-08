# Switchboard Coin Flip

Utilize Switchboard's randomness to simulate a heads or tails coin toss.

## Install

Clone the repo, install the javascript dependencies, then update the program ID
in our local keypair:

```bash
git clone https://github.com/switchboard-xyz/vrf-flip switchboard-solana-coin-flip
cd switchboard-solana-coin-flip
yarn install
anchor keys sync
```

## Switchboard Functions

Switchboard Functions allow you to trigger and execute any arbitrary code
off-chain and relay a set of instructions on-chain. This allows you to build
more reactive smart contracts. Switchboard utilizes Trusted Execution
Environments in order to verifiably run your code. After the execution, a
`MRENCLAVE` value is generated and verified against a set of pre-defined
measurements you whitelist. This `MRENCLAVE` value will change anytime your
code's binary changes, whether due to a new dependency or updated logic.

Switchboard Functions can be run on a schedule by providing a cron-based pattern
when initializing the function - off-chain oracles will use this cron schedule
to deteremine if your function is ready to be run again. Switchboard Functions
can also be run on-demand by creating a Request account for a function which
allows custom parameters to be passed. A function can have many request accounts
(1:N mapping) - request accounts allow custom parameters and can be thought of
as user-level reactions to your app. So a user interacts with your program, you
trigger a request, then have your Switchboard Function handle the logic of which
instruction to respond with to settle the users action.

Switchboard Functions is a docker container that you build that receives a set
of environment variables and responds with a set of instructions. You must
publish this container to a public registry so oracles can pull it.

## Overview

This example will walk you through simulating a heads or tails coin toss. You
will first initialize a House account which manages the program and defines the
Switchboard Function that is allowed to make changes to our programs state. Then
you will create a new user, guess the outcome of a coin-toss, and await the
Switchboard Oracle to fulfill the result.

We'll be working backwards a bit to better explain how functions work. On-demand
functions allow us to respond to user actions - so we know we'll need to respond
with some instruction that has the users coin flip account and either heads or
tails. In our docker container we will define a set of params we expect to be
provided with the request then emit this instruction with the result. So let's
start there.

### Docker Container

In [./switchboard-function/src/main.rs](./switchboard-function/src/main.rs) we
build our function. We first build the function runner, which generates a new
keypair inside a secure enclave which we use to sign our emitted instruction.
Because this keypair was generated within a secure enclave, it is very secure
from memory extraction attacks and we can be confident that our on-chain actions
were generated with our code.

You dont need to know exactly what's happening in here yet, just know that we
will need the following parameters to run this function:

- Program ID - our flip program's address
- Mint Key - the address of the mint used for guessing and rewarding
- Users Key - the users flip account
- Escrow Key - the token address where the escrow funds are stored
- Reward Key - the token address where to send rewards if the user guessed
  correctly

```rust
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
```
