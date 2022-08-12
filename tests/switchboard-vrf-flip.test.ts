import * as anchor from "@project-serum/anchor";
import * as anchor24 from "anchor-24-2";
import * as spl from "@solana/spl-token-v2";
import { Program } from "@project-serum/anchor";
import { SwitchboardVrfFlip } from "../target/types/switchboard_vrf_flip";
import { AnchorWallet } from "@switchboard-xyz/switchboard-v2";
import { SwitchboardTestContext } from "@switchboard-xyz/sbv2-utils";
import { GameTypeValue, House, User } from "../client";
import { createFlipUser, FlipUser } from "../client/utils";

describe("switchboard-vrf-flip", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SwitchboardVrfFlip as Program<SwitchboardVrfFlip>;

  const connection = program.provider.connection;

  const payer = (
    (program.provider as anchor.AnchorProvider).wallet as AnchorWallet
  ).payer;

  let switchboard: SwitchboardTestContext;

  let house: House;

  let mint: spl.Mint;

  // let payerTokenAccount: PublicKey;

  let flipUser: FlipUser;

  before(async () => {
    // First, attempt to load the switchboard devnet PID
    try {
      switchboard = await SwitchboardTestContext.loadDevnetQueue(
        program.provider as anchor.AnchorProvider,
        "F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy",
        5_000_000 // .005 wSOL
      );
      console.log("devnet detected");
      return;
    } catch (error: any) {
      console.log(`Error: SBV2 Devnet - ${error.message}`);
      // console.error(error);
    }
    try {
      switchboard = await SwitchboardTestContext.loadFromEnv(
        program.provider as anchor.AnchorProvider,
        undefined,
        5_000_000 // .005 wSOL
      );
      console.log("local env detected");
    } catch (error: any) {
      console.log(
        `Failed to load the SwitchboardTestContext from a switchboard.env file`
      );
      throw error;
    }
  });

  it("initialize the house", async () => {
    house = await House.getOrCreate(program, switchboard.queue);

    console.log(house.toJSON());

    mint = await house.loadMint();

    // payerTokenAccount = (
    //   await spl.getOrCreateAssociatedTokenAccount(
    //     connection,
    //     payer,
    //     mint.address,
    //     payer.publicKey
    //   )
    // ).address;

    // console.log(`PayerTokenAccount ${payerTokenAccount}`);
  });

  it("initialize user 1", async () => {
    try {
      flipUser = await createFlipUser(program, switchboard.queue);

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
        flipUser.switchTokenWallet,
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

  it("user 1 places another bet", async () => {
    if (flipUser === undefined) {
      throw new Error(`failed to find user to place a bet for`);
    }

    try {
      const newUserState = await flipUser.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        flipUser.switchTokenWallet,
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
    try {
      const newUser = await flipUser.user.program.methods
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
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      throw new Error(`This should have thrown an error`);
    } catch (error: any) {
      // if (error instanceof anchor.AnchorError) {
      // }
      if (
        !error
          .toString()
          .includes(
            `Cross-program invocation with unauthorized signer or writable account`
          ) &&
        !error.toString().includes(`Signature verification failed`)
      ) {
        throw error;
      }
    }
  });

  it("a new user fails to place back to back bets", async () => {
    const user2 = await createFlipUser(program, switchboard.queue);

    const bet1 = await user2.user.placeBet(
      GameTypeValue.COIN_FLIP,
      1,
      new anchor.BN(0),
      user2.switchTokenWallet
    );
    try {
      const bet2 = await user2.user.placeBet(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        user2.switchTokenWallet
      );
    } catch (error) {
      if (!error.toString().includes("0x1775")) {
        throw error;
      }
    }
  });

  it("a new user rolls a 6 sided dice", async () => {
    const user3 = await createFlipUser(program, switchboard.queue);

    try {
      const newUserState = await user3.user.placeBetAndAwaitFlip(
        GameTypeValue.SIX_SIDED_DICE_ROLL,
        3,
        new anchor.BN(0),
        user3.switchTokenWallet,
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
    const user4 = await createFlipUser(program, switchboard.queue);

    try {
      const newUserState = await user4.user.placeBetAndAwaitFlip(
        GameTypeValue.SIX_SIDED_DICE_ROLL,
        7,
        new anchor.BN(0),
        user4.switchTokenWallet,
        45
      );
    } catch (error) {
      if (
        !error.toString().includes("0x1777") &&
        !error.toString().includes("InvalidBet")
      ) {
        throw error;
      }
    }
  });

  it("a new user rolls a 20 sided dice", async () => {
    const user5 = await createFlipUser(program, switchboard.queue);

    try {
      const newUserState = await user5.user.placeBetAndAwaitFlip(
        GameTypeValue.TWENTY_SIDED_DICE_ROLL,
        13,
        new anchor.BN(0),
        user5.switchTokenWallet,
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
    const user = await createFlipUser(program, switchboard.queue, 0);

    await user.user.placeBetAndAwaitFlip(
      GameTypeValue.COIN_FLIP,
      1,
      new anchor.BN(0),
      user.switchTokenWallet
    );
  });

  it("a new user flips a coin with a half empty wrapped SOL wallet", async () => {
    const user = await createFlipUser(program, switchboard.queue, 0.001);

    try {
      await user.user.placeBetAndAwaitFlip(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        user.switchTokenWallet
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
    const keypair = anchor.web3.Keypair.generate();
    const airdropTxn = await program.provider.connection.requestAirdrop(
      keypair.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(airdropTxn);

    const provider = new anchor.AnchorProvider(
      program.provider.connection,
      new AnchorWallet(keypair),
      {}
    );
    const flipProgram = new anchor.Program(
      program.idl,
      program.programId,
      provider
    );
    const newSwitchboardProgram = new anchor24.Program(
      switchboard.program.idl,
      switchboard.program.programId,
      provider
    );

    const user = await User.create(flipProgram, newSwitchboardProgram);

    try {
      await user.placeBetAndAwaitFlip(
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
  //         ...(await createFlipUser(program, switchboard.queue)),
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
