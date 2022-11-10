# Switchboard VRF Flip

Utilize Switchboard's verifiable randomness to simulate a heads or tails coin toss.

## Setup

```
git clone https://github.com/switchboard-xyz/vrf-flip.git && cd vrf-flip
yarn install
yarn link
```

Setup program keypairs and client for your environment

```
yarn client:gen
```

Optionally, deploy to localnet

```
anchor build && anchor deploy
```

### Optional, Setup a Localnet Switchboard Environment

Run the following command to create a localnet switchboard environment

```
sbv2 solana localnet:env --keypair ../payer-keypair.json
```

This command will output:

- **start-local-validator.sh**: starts a local Solana validator with the Switchboard program, IDL, and our devnet environment pre-loaded
- **start-oracle.sh**: start a Switchboard oracle and start heartbeating on the localnet queue
- **docker-compose.yml**: docker file with the Switchboard oracle environment
- **switchboard.env**: contains your Switchboard accounts

In three separate shells, run the following commands in this order:

- `./.switchboard/start-local-validator.sh`
- `./.switchboard/start-oracle.sh`
- `anchor test --skip-local-validator`

The anchor test are configured to first fetch the account info for the Switchboard DAO controlled devnet permissionless queue. If the account info is not found, it assumes a localnet connection and looks for the `switchboard.env` with your Switchboard environment specific public keys. If a`.switchboard` directory or `switchboard.env` file is not found in the root project directory, it will look 2 levels higher until giving up.

## CLI

**_NOTE:_** If using localnet, make sure to pass `-c localnet` to the commands below.

Create a keypair for the house authority

```
 solana-keygen new --no-bip39-passphrase --outfile house-authority-keypair.json
```

Create the House account

```
sbv2-vrf-flip init house-authority-keypair.json F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy
# sbv2-vrf-flip init KEYPAIR QUEUEKEY
```

**_NOTE:_** The House must be initialized with a queue that has `unpermissioned_vrf_enabled` enabled.

Create a keypair for the user

```
 solana-keygen new --no-bip39-passphrase --outfile user-keypair.json
```

Create the User account

```
sbv2-vrf-flip create user-keypair.json
```

Request some FLIP tokens

```
sbv2-vrf-flip airdrop user-keypair.json
```

PLAY!

```
sbv2-vrf-flip play user-keypair.json --gameType coin-flip --guess 2
```

where,

- `gameType` can be `coin-flip`, `roll-dice`, `roll-20-sided-dice`.
- `guess` can be 1 through 2 for a `coin-flip`, 1 through 6 for `dice-roll`, and 1 through 20 for a `roll-20-sided-dice`
- `betAmount` is the number of tokens to wager

## Speed Run

```
solana-keygen new --no-bip39-passphrase --outfile house-authority-keypair.json
sbv2-vrf-flip init house-authority-keypair.json F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy
solana-keygen new --no-bip39-passphrase --outfile user-keypair.json
sbv2-vrf-flip create user-keypair.json
sbv2-vrf-flip airdrop user-keypair.json
sbv2-vrf-flip play user-keypair.json --gameType coin-flip --guess 2
```
