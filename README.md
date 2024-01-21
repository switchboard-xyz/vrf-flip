# DEMO

https://vrf-demo.switchboard.xyz/ ( believe this is devnet only )

# Switchboard VRF Flip

Utilize Switchboard's verifiable randomness to simulate a heads or tails coin
toss.

## Setup

```bash
git clone https://github.com/switchboard-xyz/vrf-flip.git && cd vrf-flip
yarn install
yarn link
```

Setup program keypairs and client for your environment

```bash
yarn client:gen
```

Deploy the program to devnet with your new Program ID

```bash
anchor build && anchor deploy
```

## CLI

**_NOTE:_** If using localnet, make sure to pass `-c localnet` to the commands
below.

Create a keypair for the house authority

```bash
solana-keygen new --no-bip39-passphrase --outfile house-authority-keypair.json
```

Create the House account

```bash
sbv2-vrf-flip init house-authority-keypair.json uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX
# sbv2-vrf-flip init KEYPAIR QUEUEKEY
```

**_NOTE:_** The House must be initialized with a queue that has
`unpermissioned_vrf_enabled` enabled.

Create a keypair for the user

```bash
solana-keygen new --no-bip39-passphrase --outfile user-keypair.json
```

Create the User account

```bash
sbv2-vrf-flip create user-keypair.json
```

Request some FLIP tokens

```bash
sbv2-vrf-flip airdrop user-keypair.json
```

PLAY!

```bash
sbv2-vrf-flip play user-keypair.json --gameType coin-flip --guess 2
```

where,

- `gameType` can be `coin-flip`, `roll-dice`, `roll-20-sided-dice`.
- `guess` can be 1 through 2 for a `coin-flip`, 1 through 6 for `dice-roll`, and
  1 through 20 for a `roll-20-sided-dice`
- `betAmount` is the number of tokens to wager

## Speed Run

```bash
solana-keygen new --no-bip39-passphrase --outfile house-authority-keypair.json
sbv2-vrf-flip init house-authority-keypair.json uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX
solana-keygen new --no-bip39-passphrase --outfile user-keypair.json
sbv2-vrf-flip create user-keypair.json
sbv2-vrf-flip airdrop user-keypair.json
sbv2-vrf-flip play user-keypair.json --gameType coin-flip --guess 2
```
