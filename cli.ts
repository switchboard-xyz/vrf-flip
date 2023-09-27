#!/usr/bin/env ts-node-esm

/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-var-requires */
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
// import yargs from "yargs";
// import { hideBin } from "yargs/helpers";
import { QueueAccount, SwitchboardProgram } from "@switchboard-xyz/solana.js";
import chalk from "chalk";
import fs from "fs";
import {
  FlipProgram,
  GameTypeValue,
  House,
  PROGRAM_ID,
  User,
  UserBetPlaced,
  UserBetSettled,
  UserState,
} from "./client/index";
import { IDL } from "./target/types/switchboard_vrf_flip";
import { findAnchorTomlWallet, tokenAmountToBig } from "./client/utils";
import { sleep } from "@switchboard-xyz/common";
var Spinner = require("cli-spinner").Spinner;

const DEFAULT_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const DEFAULT_LOCALNET_RPC = "http://localhost:8899";

const DEFAULT_COMMITMENT = "confirmed";

const VRF_REQUEST_AMOUNT = 2_000_000;

export const CHECK_ICON = chalk.green("\u2714");
export const FAILED_ICON = chalk.red("\u2717");

yargs(hideBin(process.argv))
  .scriptName("sbv2-vrf-flip")
  .command(
    "init [keypair] [queueKey] [mintKeypair]",
    "initiate the house",
    (y: any) => {
      return y
        .positional("keypair", {
          type: "string",
          describe:
            "filesystem path to a Solana keypair file that will be the authority for the house",
          required: true,
        })
        .positional("queueKey", {
          type: "string",
          describe: "publicKey of the oracle queue to target for VRF requests",
          default: "uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX",
        })
        .positional("mintKeypair", {
          type: "string",
          describe:
            "filesystem path to a Solana keypair file that will be the house mint",
        });
    },
    async function (argv: any) {
      const { queueKey, rpcUrl, cluster, keypair, mintKeypair } = argv;

      const { flipAnchorProgram, switchboardProgram, provider } = await loadCli(
        rpcUrl,
        cluster,
        keypair
      );

      const mint = mintKeypair
        ? loadKeypair(mintKeypair)
        : anchor.web3.Keypair.generate();

      // const payerBalance = await checkNativeBalance(
      //   flipProgram.provider.connection,
      //   payer,
      //   cluster === "mainnet-beta",
      //   0.025 * LAMPORTS_PER_SOL
      // );

      let house: House;
      try {
        house = await House.load(flipAnchorProgram);
        console.log(
          `${chalk.blue("Info")}: VRF Flip House account (${chalk.yellow(
            house.publicKey.toBase58()
          )}) already exist`
        );
      } catch (error) {
        if (
          !error.toString().includes("House account has not been created yet")
        ) {
          throw error;
        }
        const queueAccount = new QueueAccount(
          switchboardProgram,
          new PublicKey(queueKey)
        );

        house = await House.create(flipAnchorProgram, queueAccount, mint);

        console.log(`${CHECK_ICON} House account created successfully`);
      }

      console.log(
        JSON.stringify(
          {
            ...house.toJSON(),
            ebuf: undefined,
          },
          undefined,
          2
        )
      );

      process.exit(0);
    }
  )
  .command(
    "create [keypair]",
    "create a User account",
    (y: any) => {
      return y.positional("keypair", {
        type: "string",
        describe: "filesystem path to a Solana keypair file",
        required: true,
      });
    },
    async function (argv: any) {
      const { rpcUrl, cluster, keypair } = argv;

      const { flipAnchorProgram, switchboardProgram, provider } = await loadCli(
        rpcUrl,
        cluster,
        keypair
      );

      const flipProgram = await FlipProgram.load(flipAnchorProgram);

      // const payerBalance = await checkNativeBalance(
      //   flipProgram.provider.connection,
      //   payer,
      //   cluster === "mainnet-beta",
      //   0.25 * LAMPORTS_PER_SOL
      // );

      let user: User;
      try {
        user = await User.load(flipProgram, flipProgram.payerPubkey);
        console.log(
          `${chalk.blue("Info")}: VRF Flip User account (${chalk.yellow(
            user.publicKey.toBase58()
          )}) already exists for authority (${chalk.yellow(
            flipProgram.payerPubkey.toBase58()
          )})`
        );
      } catch (error) {
        if (!error.toString().includes("User account does not exist")) {
          throw error;
        }

        user = await User.create(flipProgram);

        console.log(`${CHECK_ICON} User account created successfully`);
      }

      console.log(
        JSON.stringify(
          {
            ...user.toJSON(),
            history: undefined,
            ebuf: undefined,
          },
          undefined,
          2
        )
      );

      process.exit(0);
    }
  )
  .command(
    "play [keypair]",
    "request randomness for a given USER",
    (y: any) => {
      return y
        .positional("keypair", {
          type: "string",
          describe: "filesystem path to a Solana keypair file",
          required: true,
        })
        .option("gameType", {
          type: "string",
          alias: "t",
          describe: "game to play",
          options: ["coin-flip", "roll-dice", "roll-20-sided-dice"],
          demand: true,
        })
        .option("guess", {
          type: "number",
          alias: "g",
          describe: "your guess for the gameType's outcome",
          demand: true,
        })
        .option("betAmount", {
          type: "number",
          alias: "a",
          describe: "number of FLIP tokens to wager",
          default: 0,
          demand: false,
        });
    },
    async function (argv: any) {
      const { rpcUrl, cluster, keypair, gameType, guess, betAmount } = argv;

      const userGuess = Math.floor(guess as number);
      let gameTypeEnum: GameTypeValue;
      switch (gameType) {
        case "coin-flip": {
          if (userGuess < 1 || userGuess > 2) {
            throw new Error(
              `Coin flip must be between 1 and 2, received ${userGuess}`
            );
          }
          gameTypeEnum = GameTypeValue.COIN_FLIP;
          break;
        }
        case "dice-roll": {
          if (userGuess < 1 || userGuess > 6) {
            throw new Error(
              `Dice roll must be between 1 and 6, received ${userGuess}`
            );
          }
          gameTypeEnum = GameTypeValue.SIX_SIDED_DICE_ROLL;
          break;
        }
        case "roll-20-sided-dice": {
          if (userGuess < 1 || userGuess > 20) {
            throw new Error(
              `20 sided dice roll must be between 1 and 20, received ${userGuess}`
            );
          }
          gameTypeEnum = GameTypeValue.TWENTY_SIDED_DICE_ROLL;
          break;
        }
        default: {
          throw new Error(
            `gameType must be 'coin-flip', 'dice-roll', or '20-sided-dice-roll', received ${gameType}`
          );
        }
      }

      const { flipAnchorProgram, switchboardProgram, provider } = await loadCli(
        rpcUrl,
        cluster,
        keypair
      );

      // const payerBalance = await checkNativeBalance(
      //   flipProgram.provider.connection,
      //   payer,
      //   cluster === "mainnet-beta",
      //   10000
      // );

      const house = await House.load(flipAnchorProgram);
      const flipProgram = await FlipProgram.load(flipAnchorProgram);
      const user = await User.load(flipProgram, flipProgram.payerPubkey);

      // const flipMint = await house.loadMint();
      // const payerFlipTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
      //   flipProgram.provider.connection,
      //   payer,
      //   flipMint.address,
      //   payer.publicKey
      // );
      // const flipTokenBalance = await checkTokenBalance(
      //   flipProgram.provider.connection,
      //   payerFlipTokenAccount.address,
      //   payer,
      //   cluster === "mainnet-beta",
      //   betAmount
      // );

      // const queueAccount = await user.getQueueAccount(switchboardProgram);
      // const switchboardMint = await queueAccount.loadMint();
      // const payerSwitchTokenAccount =
      //   await spl.getOrCreateAssociatedTokenAccount(
      //     flipProgram.provider.connection,
      //     payer,
      //     switchboardMint.address,
      //     payer.publicKey
      //   );
      // const wrappedNativeBalance = await checkWrappedNativeBalance(
      //   flipProgram.provider.connection,
      //   payerSwitchTokenAccount.address,
      //   payer,
      //   cluster === "mainnet-beta",
      //   VRF_REQUEST_AMOUNT
      // );

      const placeBetSignature = await user.placeBet(
        gameTypeEnum,
        userGuess,
        new anchor.BN(betAmount)
      );
      // console.log(cliSpinners.bouncingBall);
      // const newUserState = await newUserStatePromise;

      const spinner = new Spinner("awaiting result ... %s");
      spinner.setSpinnerString("◐◓◑◒");
      spinner.setSpinnerDelay(125);
      spinner.start();

      const newUserStatePromise = user.awaitFlip(
        user.state.currentRound.roundId.add(new anchor.BN(1))
      );

      const newUserState = await Promise.race<UserState>([
        newUserStatePromise,
        new Promise((resolve) => {
          // console.log(cliSpinners.bouncingBall);
        }),
      ]).finally(() => {
        // console.clear();
      });

      spinner.stop(true);

      console.log(newUserState.currentRound.toJSON());
      if (user.isWinner(newUserState)) {
        console.log(
          `${chalk.green(CHECK_ICON, "User won!")} Result = ${
            newUserState.currentRound.result
          }`
        );
      } else {
        console.log(`${chalk.red(FAILED_ICON, "User Lost!")}`);
      }
      process.exit(0);
    }
  )
  .command(
    "airdrop [keypair]",
    "request an airdrop of FLIP token",
    (y: any) => {
      return y.positional("keypair", {
        type: "string",
        describe: "filesystem path to a Solana keypair file",
        required: true,
      });
    },
    async function (argv: any) {
      const { rpcUrl, cluster, keypair } = argv;

      const { flipAnchorProgram, switchboardProgram, provider } = await loadCli(
        rpcUrl,
        cluster,
        keypair
      );

      const house = await House.load(flipAnchorProgram);
      const flipProgram = await FlipProgram.load(flipAnchorProgram);
      // const flipMint = await house.loadMint();
      // const payerTokenWallet = await spl.getOrCreateAssociatedTokenAccount(
      //   flipProgram.provider.connection,
      //   payer,
      //   flipMint.address,
      //   payer.publicKey
      // );
      const user = await User.load(flipProgram, flipProgram.payerPubkey);

      try {
        const airdropReq = await flipAnchorProgram.methods
          .userAirdrop({})
          .accounts({
            user: user.publicKey,
            house: house.publicKey,
            houseVault: house.state.houseVault,
            mint: house.state.mint,
            authority: flipProgram.payerPubkey,
            airdropTokenWallet: flipProgram.mint.getAssociatedAddress(
              flipProgram.payerPubkey
            ),
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
          .rpc();
        console.log(
          `${chalk.green(CHECK_ICON, "User airdrop requested successfully")}`
        );
        console.log(
          `https://explorer.solana.com/tx/${airdropReq}?cluster=${cluster}`
        );
      } catch (error) {}

      const flipBalance = await flipProgram.mint.getAssociatedBalance(
        flipProgram.payerPubkey
      );

      console.log(
        `${chalk.blue("FLIP balance")}: ${chalk.yellow(flipBalance)} FLIP)`
      );

      process.exit(0);
    }
  )
  .command(
    "watch [authority]",
    "watch a user account for changes",
    (y: any) => {
      return y.positional("authority", {
        type: "string",
        describe: "public key of the user authority to watch",
        required: true,
      });
    },
    async function (argv: any) {
      const { rpcUrl, cluster, authority } = argv;

      const { flipAnchorProgram, switchboardProgram, provider } = await loadCli(
        rpcUrl,
        cluster
      );

      const flipProgram = await FlipProgram.load(flipAnchorProgram);

      const user = await User.load(flipProgram, new PublicKey(authority));

      user.watch(
        (event: UserBetPlaced) => {
          console.log(
            `${event.roundId.toString(10)}: ${
              event.gameType
            } User bet ${tokenAmountToBig(
              event.betAmount
            )} tokens that the result will be ${event.guess}`
          );
        },
        (event: UserBetSettled) => {
          console.log(
            `${event.roundId.toString(10)}: ${event.gameType} User ${
              event.userWon ? "won" : "lost"
            } ${tokenAmountToBig(event.escrowChange)} tokens`
          );
        }
      );

      await new Promise(() => {});
    }
  )
  .options({
    cluster: {
      type: "string",
      alias: "c",
      describe: "Solana cluster to interact with",
      options: ["devnet", "mainnet-beta", "localnet"],
      default: "devnet",
      demand: false,
    },
    rpcUrl: {
      type: "string",
      alias: "u",
      describe: "Alternative RPC URL",
    },
  })
  .help().argv;

function getRpcUrl(cluster: string): string {
  switch (cluster) {
    case "mainnet-beta":
      return DEFAULT_MAINNET_RPC;
    case "devnet":
      return DEFAULT_DEVNET_RPC;
    case "localnet":
      return DEFAULT_LOCALNET_RPC;
    default:
      throw new Error(`Failed to find RPC_URL for cluster ${cluster}`);
  }
}

async function checkNativeBalance(
  connection: Connection,
  payer: Keypair,
  isMainnet: boolean,
  minAmount = 0.25 * LAMPORTS_PER_SOL
): Promise<BigInt> {
  let payerBalance = await connection.getBalance(payer.publicKey);
  if (payerBalance < BigInt(minAmount)) {
    if (isMainnet) {
      throw new Error(`keypair has insufficient funds ${payerBalance}`);
    }
    console.log(
      `${chalk.blue(
        "Info"
      )}: Requesting an airdrop for 1 SOL to provided keypair (${chalk.yellow(
        payer.publicKey.toBase58()
      )})`
    );
    const requestAirdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(requestAirdropSignature);
    payerBalance = await connection.getBalance(payer.publicKey);
  }
  return BigInt(payerBalance);
}

// async function checkWrappedNativeBalance(
//   connection: Connection,
//   wrappedNativeAddress: PublicKey,
//   payer: Keypair,
//   isMainnet: boolean,
//   minAmount = VRF_REQUEST_AMOUNT
// ): Promise<BigInt> {
//   let tokenBalance = BigInt(
//     (await connection.getTokenAccountBalance(wrappedNativeAddress)).value.amount
//   );
//   if (tokenBalance < BigInt(minAmount)) {
//     if (isMainnet) {
//       throw new Error(
//         `wrapped native account has insufficient funds ${tokenBalance}, need ${minAmount}`
//       );
//     }
//     console.log(
//       `${chalk.blue("Info")}: Wrapping ${chalk.yellow(
//         VRF_REQUEST_AMOUNT
//       )} SOL to payers token wallet (${chalk.yellow(
//         wrappedNativeAddress.toBase58()
//       )})`
//     );
//     await sbv2Utils.transferWrappedSol(connection, payer, VRF_REQUEST_AMOUNT);
//   }
//   return tokenBalance;
// }

// async function checkTokenBalance(
//   connection: Connection,
//   tokenAddress: PublicKey,
//   payer: Keypair,
//   isMainnet: boolean,
//   minAmount = 100000
// ): Promise<BigInt> {
//   let tokenBalance = BigInt(
//     (await connection.getTokenAccountBalance(tokenAddress)).value.amount
//   );
//   if (tokenBalance < BigInt(minAmount)) {
//     // if (isMainnet) {
//     throw new Error(
//       `token account (${chalk.yellow(
//         tokenAddress.toBase58()
//       )}) has insufficient funds ${tokenBalance}, need ${minAmount}`
//     );
//     // }
//   }
//   return tokenBalance;
// }

function loadKeypair(keypairPath: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
}

async function loadCli(
  rpcUrl?: string,
  cluster?: string,
  keypairPath?: string
): Promise<{
  flipAnchorProgram: anchor.Program;
  switchboardProgram: SwitchboardProgram;
  // payer: anchor.web3.Keypair;
  provider: anchor.AnchorProvider;
}> {
  if (
    cluster !== "mainnet-beta" &&
    cluster !== "devnet" &&
    cluster !== "localnet"
  ) {
    throw new Error(
      `cluster must be mainnet-beta or devnet, cluster = ${cluster}`
    );
  }

  const walletPath = keypairPath ?? findAnchorTomlWallet();
  process.env.ANCHOR_WALLET = walletPath;
  const url = rpcUrl ?? getRpcUrl(cluster);
  // const envProvider = anchor.AnchorProvider.local(url);

  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(url, { commitment: DEFAULT_COMMITMENT }),
    new anchor.Wallet(loadKeypair(walletPath)),
    { commitment: DEFAULT_COMMITMENT }
  );

  const switchboardProgram = await SwitchboardProgram.fromProvider(provider);

  // load VRF Client program
  // @TODO load IDL asynchronously?
  const flipAnchorProgram = new anchor.Program(
    IDL,
    PROGRAM_ID,
    provider,
    new anchor.BorshCoder(IDL)
  );

  return {
    flipAnchorProgram,
    switchboardProgram,
    provider,
  };
}

async function fetchTransactions(
  connection: Connection,
  pubkey: PublicKey,
  numTransactions = 10
): Promise<any[]> {
  const signatures = (
    await connection.getSignaturesForAddress(
      pubkey,
      { limit: numTransactions },
      "confirmed"
    )
  ).map((t) => t.signature);

  console.log(`FETCHED ${signatures.length} transactions`);

  let parsedTxns: (ParsedTransactionWithMeta | null)[] = [];
  while (!parsedTxns) {
    parsedTxns = await connection.getParsedTransactions(
      signatures,
      "confirmed"
    );

    if (!parsedTxns || parsedTxns.length !== signatures.length) {
      await sleep(1000);
    }
  }

  return parsedTxns.map((tx, i) => {
    return {
      signature: signatures[i],
      logs: tx.meta.logMessages,
    };
  });
}
