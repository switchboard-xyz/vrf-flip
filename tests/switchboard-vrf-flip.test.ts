import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SwitchboardVrfFlip } from "../target/types/switchboard_vrf_flip";
import { FlipProgram, GameTypeValue, House, User } from "../client";
import { createFlipUser, FlipUser } from "../client/utils";
import assert from "assert";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";
import {
  QueueAccount,
  SwitchboardProgram,
  SwitchboardTestContext,
  SWITCHBOARD_LABS_DEVNET_PERMISSIONLESS_QUEUE,
  SWITCHBOARD_LABS_MAINNET_PERMISSIONLESS_QUEUE,
  VrfAccount,
} from "@switchboard-xyz/solana.js";
import { VRF_FLIP_NETWORK } from "./switchboard-network";
import { NodeOracle } from "@switchboard-xyz/oracle";

// CJQVYHYgv1nE5zoKjS9w7VrVzTkkUGCgSSReESKuJZV
export const MINT_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array([
    36, 23, 151, 78, 88, 73, 152, 187, 219, 152, 30, 131, 123, 141, 255, 131,
    248, 148, 57, 33, 140, 99, 103, 206, 63, 132, 241, 52, 36, 57, 125, 150, 2,
    229, 17, 159, 63, 199, 173, 41, 183, 244, 164, 227, 9, 74, 212, 212, 103,
    160, 186, 32, 184, 217, 41, 28, 96, 61, 36, 135, 186, 27, 34, 96,
  ])
);

describe("switchboard-vrf-flip", () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  console.log(provider.connection.rpcEndpoint);

  const anchorProgram: Program<SwitchboardVrfFlip> =
    anchor.workspace.SwitchboardVrfFlip;

  let program: FlipProgram;

  let switchboardProgram: SwitchboardProgram;
  let queueAccount: QueueAccount;
  let switchboard: SwitchboardTestContext | undefined;
  let oracle: NodeOracle | undefined;

  let house: House;

  let flipUser: FlipUser;

  before(async () => {
    console.log(`vrf-flip programId: ${anchorProgram.programId}`);

    if (
      !process.env.SOLANA_CLUSTER ||
      (process.env.SOLANA_CLUSTER !== "devnet" &&
        process.env.SOLANA_CLUSTER !== "mainnet-beta")
    ) {
      // if localnet, we need to create our own queue and run our own oracle
      switchboard = await SwitchboardTestContext.loadFromProvider(
        provider,
        VRF_FLIP_NETWORK
      );
      switchboardProgram = switchboard.program;
      queueAccount = switchboard.queue;

      console.log(switchboard.program.cluster);

      console.log(
        `switchboard programId: ${switchboard.queue.program.programId}`
      );
      console.log(`switchboard queue: ${switchboard.queue.publicKey}`);
      console.log(`switchboard oracle: ${switchboard.oracle.publicKey}`);

      oracle = await NodeOracle.fromReleaseChannel({
        chain: "solana",
        releaseChannel: "testnet",
        network: "localnet", // disables production capabilities like monitoring and alerts
        rpcUrl: switchboard.program.connection.rpcEndpoint,
        oracleKey: switchboard.oracle.publicKey.toBase58(),
        secretPath: switchboard.walletPath,
        silent: false, // set to true to suppress oracle logs in the console
        envVariables: {
          VERBOSE: "1",
          DEBUG: "1",
          DISABLE_NONCE_QUEUE: "1",
          DISABLE_METRICS: "1",
        },
      });

      await oracle.startAndAwait();
    } else {
      // if devnet/mainnet, use the permissionless queues
      switchboardProgram = await SwitchboardProgram.fromProvider(provider);
      if (switchboardProgram.cluster === "devnet") {
        queueAccount = new QueueAccount(
          switchboardProgram,
          SWITCHBOARD_LABS_DEVNET_PERMISSIONLESS_QUEUE
        );
      } else if (switchboardProgram.cluster === "mainnet-beta") {
        queueAccount = new QueueAccount(
          switchboardProgram,
          SWITCHBOARD_LABS_MAINNET_PERMISSIONLESS_QUEUE
        );
      } else {
        throw new Error(
          `Failed to load Switchboard queue for cluster, ${switchboardProgram.cluster}`
        );
      }
      await queueAccount.loadData();
    }
  });

  after(() => {
    oracle?.stop();
  });

  it("initialize the house", async () => {
    house = await House.getOrCreate(anchorProgram, queueAccount, MINT_KEYPAIR);

    console.log(house.toJSON());

    program = await FlipProgram.load(anchorProgram);
  });

  it("initialize user 1", async () => {
    try {
      flipUser = await createFlipUser(program);

      console.log({
        ...flipUser.user.toJSON(),
        history: undefined,
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

  it("user 1 requests an airdrop", async () => {
    if (flipUser === undefined) {
      throw new Error(`failed to find user to place a bet for`);
    }

    try {
      const startingBalance =
        await program.provider.connection.getTokenAccountBalance(
          flipUser.user.state.rewardAddress
        );
      const airdropTxn = await flipUser.user.airdrop();

      const newTokenBalance =
        await program.provider.connection.getTokenAccountBalance(
          flipUser.user.state.rewardAddress
        );

      if (Number(newTokenBalance.value.amount) === Number(startingBalance)) {
        throw new Error(`Failed to request an airdrop`);
      } else {
        console.log(
          `Users Token Balance: ${newTokenBalance.value.uiAmountString}`
        );
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

  it("user 1 places a bet", async () => {
    if (flipUser === undefined) {
      throw new Error(`failed to find user to place a bet for`);
    }

    try {
      const newUserState = await flipUser.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        45
      );
      flipUser.user.state = newUserState;

      if (flipUser.user.isWinner(newUserState)) {
        console.log(`User won! Result = ${newUserState.currentRound.result}`);
      } else {
        console.log(
          `whomp whomp, loser! User guess = ${newUserState.currentRound.guess}, Result = ${newUserState.currentRound.result}`
        );
      }
    } catch (error) {
      console.error(error);

      // flip failed, lets check the state of the VRF Account
      const [vrfAccount, vrfState] = await VrfAccount.load(
        switchboardProgram,
        flipUser.user.state.vrf
      );

      const counter = vrfState.counter.toNumber();
      const status = vrfState.status.kind;
      const txRemaining = vrfState.builders[0].txRemaining;
      const requestSlot = vrfState.currentRound.requestSlot.toNumber();

      console.log(`Counter: ${counter}`);
      console.log(`RequestSlot: ${requestSlot}`);
      console.log(`Status: ${status}`);
      console.log(`TxnRemaining: ${txRemaining}`);

      // check if vrf was ever requested
      if (counter === 0 || status === "StatusNone") {
        const txns = await grepTransactionLogs(
          vrfAccount.program.connection,
          vrfAccount.publicKey,
          "Instruction: VrfRequestRandomness",
          {
            limit: 50,
            minContextSlot:
              vrfState.currentRound.requestSlot.toNumber() > 0
                ? vrfState.currentRound.requestSlot.toNumber()
                : undefined,
          }
        );
        console.log(txns.grepLogs);
        throw new Error(
          `VrfAccount counter = 0, check your requestRandomness CPI ixn logs for details`
        );
      }

      // check if any VRF verify txns were sent
      if (status === "StatusRequesting") {
        console.log(`VRF was requested but did not complete`);
        if (txRemaining === 277) {
          throw new Error(
            `No VRF verify transactions were sent - was the oracle running? `
          );
        }
      }

      // check if callback was ever invoked
      if (status === "StatusVerified") {
        console.log(`VRF was verified successfully but the callback failed`);

        // check callback
        const txns = await grepTransactionLogs(
          vrfAccount.program.connection,
          vrfAccount.publicKey,
          "Invoking callback",
          {
            limit: 50,
            minContextSlot: requestSlot > 0 ? requestSlot : undefined,
          }
        );

        if (txns.grepTransactions.length !== 0) {
          console.log(`VRF attempted to invoke your callback`);
          console.log(txns.grepLogs + "\n");
        } else {
          console.log(`No callback attempts found`);
        }
      }

      throw error;
    }

    await flipUser.user.reload();
    console.log({
      ...flipUser.user.toJSON(),
      historyIdx: flipUser.user.state.history.idx,
      history: flipUser.user.state.history.rounds
        .slice(0, flipUser.user.state.history.idx)
        .map((i) => i.toJSON()),
    });
  });

  it("user 1 places another bet", async () => {
    if (flipUser === undefined) {
      throw new Error(`failed to find user to place a bet for`);
    }

    try {
      const newUserState = await flipUser.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        45
      );
      flipUser.user.state = newUserState;

      if (flipUser.user.isWinner(newUserState)) {
        console.log(`User won! Result = ${newUserState.currentRound.result}`);
      } else {
        console.log(
          `whomp whomp, loser! User guess = ${newUserState.currentRound.guess}, Result = ${newUserState.currentRound.result}`
        );
      }
    } catch (error) {
      console.error(error);
      throw error;
    }

    await flipUser.user.reload();
    console.log({
      ...flipUser.user.toJSON(),
      historyIdx: flipUser.user.state.history.idx,
      history: flipUser.user.state.history.rounds
        .slice(0, flipUser.user.state.history.idx)
        .map((i) => i.toJSON()),
    });
  });

  it("fails to create duplicate user accounts", async () => {
    assert.rejects(async () => {
      await flipUser.user.program.program.methods
        .userInit({
          switchboardStateBump: flipUser.user.state.switchboardStateBump,
          vrfPermissionBump: flipUser.user.state.vrfPermissionBump,
        })
        .accounts({
          user: flipUser.user.publicKey,
          house: house.publicKey,
          mint: house.state.mint,
          authority: flipUser.keypair.publicKey,
          escrow: flipUser.user.state.escrow,
          rewardAddress: flipUser.user.state.rewardAddress,
          vrf: flipUser.user.state.vrf,
          payer: flipUser.keypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    }, new RegExp(/Cross-program invocation with unauthorized signer or writable account/g));
  });

  it("a new user fails to place back to back bets", async () => {
    const user2 = await createFlipUser(program);

    const bet1 = await user2.user.placeBet(
      GameTypeValue.COIN_FLIP,
      1,
      new anchor.BN(0)
    );

    assert.rejects(async () => {
      await user2.user.placeBet(GameTypeValue.COIN_FLIP, 1, new anchor.BN(0));
    }, new RegExp(/0x1775/g));
  });

  it("a new user rolls a 6 sided dice", async () => {
    const user3 = await createFlipUser(program);

    try {
      const newUserState = await user3.user.placeBetAndAwaitFlip(
        GameTypeValue.SIX_SIDED_DICE_ROLL,
        3,
        new anchor.BN(0),
        45
      );

      if (user3.user.isWinner(newUserState)) {
        console.log(
          `User3 rolled the dice ... and won! ${newUserState.currentRound.result}`
        );
      } else {
        console.log(
          `User3 rolled the dice ... and lost! whomp whomp, loser! User guess = ${newUserState.currentRound.guess}, Result = ${newUserState.currentRound.result}`
        );
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

  it("a new user fails to place a bet above the max", async () => {
    const user4 = await createFlipUser(program);

    assert.rejects(async () => {
      await user4.user.placeBetAndAwaitFlip(
        GameTypeValue.SIX_SIDED_DICE_ROLL,
        7,
        new anchor.BN(0),
        45
      );
    }, new RegExp(/0x1777/g));
  });

  it("a new user rolls a 20 sided dice", async () => {
    const user5 = await createFlipUser(program);

    try {
      const newUserState = await user5.user.placeBetAndAwaitFlip(
        GameTypeValue.TWENTY_SIDED_DICE_ROLL,
        13,
        new anchor.BN(0),
        45
      );

      if (user5.user.isWinner(newUserState)) {
        console.log(
          `User5 rolled the dice ... and won! ${newUserState.currentRound.result}`
        );
      } else {
        console.log(
          `User5 rolled the dice ... and lost! whomp whomp, loser! User guess = ${newUserState.currentRound.guess}, Result = ${newUserState.currentRound.result}`
        );
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

  it("a new user flips a coin with an empty wrapped SOL wallet", async () => {
    const user = await createFlipUser(program, 0);

    await user.user.placeBetAndAwaitFlip(
      GameTypeValue.COIN_FLIP,
      1,
      new anchor.BN(0)
    );
  });

  it("a new user flips a coin with a half empty wrapped SOL wallet", async () => {
    const user = await createFlipUser(program, 0.001);

    try {
      await user.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0)
      );
    } catch (error) {
      console.error(error);
      if ("logs" in error) {
        console.error(error.logs);
      }
      throw error;
    }
  });

  it("a new user flips a coin with no wrapped sol wallet provided", async () => {
    const user = await createFlipUser(program, 0);

    try {
      await user.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0)
      );
    } catch (error) {
      console.error(error);
      if ("logs" in error) {
        console.error(error.logs);
      }
      throw error;
    }
  });

  // it("10 users roll the dice 100 times", async () => {
  //   const users: (FlipUser & { id: number })[] = await Promise.all(
  //     Array.from(Array(10).keys()).map(async (n) => {
  //       return {
  //         id: n,
  //         ...(await createFlipUser(program, queueAccount.account)),
  //       };
  //     })
  //   );

  //   console.log(`10 users created`);

  //   const flipThenResult = async ({
  //     id,
  //     keypair,
  //     switchboardProgram,
  //     switchTokenWallet,
  //     user,
  //   }: {
  //     id: number;
  //     keypair: Keypair;
  //     switchboardProgram: anchor.Program;
  //     switchTokenWallet: PublicKey;
  //     user: User;
  //   }) => {
  //     const resultState = await user.placeBetAndAwaitFlip(
  //       GameTypeValue.COIN_FLIP,
  //       1,
  //       new anchor.BN(0),
  //       switchTokenWallet,
  //       90
  //     );
  //     return user.isWinner(resultState);
  //   };

  //   const results = await Promise.all(
  //     users.map(async (user) => {
  //       let results: boolean[] = [];
  //       for await (const n of Array.from(Array(100).keys())) {
  //         try {
  //           const result = await flipThenResult(user);
  //           results.push(result);
  //           console.log(`User ${user.id} - ${n} / 10 = ${result}`);
  //         } catch (error) {
  //           results.push(undefined);
  //           console.log(`User ${user.id} - ${n} / 10 = error`);
  //         }
  //       }
  //       return results;
  //     })
  //   );

  //   results.forEach((result, i) => {
  //     console.log(`User ${i}: ${result.filter((r) => r).length}`);
  //   });
  // });
});

async function grepTransactionLogs(
  connection: Connection,
  publicKey: PublicKey,
  grep?: string,
  options?: anchor.web3.SignaturesForAddressOptions
): Promise<{
  signatures: Array<string>;
  allTransactions: Array<ParsedTransactionWithMeta>;
  grepTransactions: Array<ParsedTransactionWithMeta>;
  grepLogs: string;
}> {
  const transactions = await connection.getSignaturesForAddress(
    publicKey,
    options,
    "confirmed"
  );
  const signatures = transactions.map((txn) => txn.signature);
  const parsedTransactions: Array<ParsedTransactionWithMeta> =
    await connection.getParsedTransactions(signatures, "confirmed");

  const grepTransactions: Array<ParsedTransactionWithMeta> =
    parsedTransactions.filter((t) => {
      if (t === null) {
        return false;
      }

      if (grep) {
        const logs = t.meta?.logMessages?.join("\n") ?? "";
        if (logs.includes(grep)) {
          return true;
        }
      }

      return false;
    });

  return {
    signatures,
    allTransactions: parsedTransactions,
    grepTransactions,
    grepLogs: grepTransactions
      .map((t) => t.meta?.logMessages?.join("\n") ?? "")
      .join("\n"),
  };
}
function filterTransactionLogs(
  txns: Array<ParsedTransactionWithMeta>,
  grep: string
): Array<ParsedTransactionWithMeta> {
  const grepTransactions: Array<ParsedTransactionWithMeta> = txns.filter(
    (t) => {
      if (t === null) {
        return false;
      }

      const logs = t.meta?.logMessages?.join("\n") ?? "";
      if (logs.includes(grep)) {
        return true;
      }

      return false;
    }
  );

  return grepTransactions;
}
