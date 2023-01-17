import * as anchor from "@project-serum/anchor";
import fs from "fs";
import path from "path";
import { Program } from "@project-serum/anchor";
import { IDL, SwitchboardVrfFlip } from "../target/types/switchboard_vrf_flip";
import { FlipProgram, GameTypeValue, House, User } from "../client";
import { createFlipUser, FlipUser } from "../client/utils";
import assert from "assert";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AnchorWallet,
  QueueAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { DockerOracle } from "@switchboard-xyz/common";

export const MINT_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array([
    36, 23, 151, 78, 88, 73, 152, 187, 219, 152, 30, 131, 123, 141, 255, 131,
    248, 148, 57, 33, 140, 99, 103, 206, 63, 132, 241, 52, 36, 57, 125, 150, 2,
    229, 17, 159, 63, 199, 173, 41, 183, 244, 164, 227, 9, 74, 212, 212, 103,
    160, 186, 32, 184, 217, 41, 28, 96, 61, 36, 135, 186, 27, 34, 96,
  ])
);

async function getOrCreateKeypair(
  provider: anchor.AnchorProvider,
  keypairPath: string
): Promise<Keypair> {
  if (!fs.existsSync(keypairPath)) {
    const keypair = Keypair.generate();
    fs.writeFileSync(keypairPath, `[${new Uint8Array(keypair.secretKey)}]`);
  }

  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const balance = await provider.connection.getBalance(keypair.publicKey);
  if (balance < 2) {
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: keypair.publicKey,
          lamports: 2 * LAMPORTS_PER_SOL,
        })
      )
    );
  }

  return keypair;
}

describe("switchboard-vrf-flip", () => {
  const provider = anchor.AnchorProvider.local();

  console.log(`rpcUrl: ${provider.connection.rpcEndpoint}`);

  anchor.setProvider(provider);

  const anchorProgram: Program<SwitchboardVrfFlip> =
    anchor.workspace.SwitchboardVrfFlip;

  // const anchorProgram: Program<SwitchboardVrfFlip> = new Program(
  //   IDL,
  //   PROGRAM_ID,
  //   provider,
  //   new anchor.BorshCoder(IDL)
  // );

  let program: FlipProgram;

  let switchboard: SwitchboardProgram;
  let queueAccount: QueueAccount;
  let dockerOracle: DockerOracle;

  // let switchboard: Switchboard;

  let house: House;

  let flipUser: FlipUser;

  before(async () => {
    switchboard = await SwitchboardProgram.fromProvider(provider);

    [queueAccount] = await QueueAccount.create(switchboard, {
      name: "My Queue",
      metadata: "Queue Metadata",
      queueSize: 10,
      reward: 0,
      minStake: 0,
      oracleTimeout: 900,
      unpermissionedFeeds: true,
      unpermissionedVrf: true,
      enableBufferRelayers: false,
    });
    console.log(`queue: ${queueAccount.publicKey}`);

    const oracleAuthorityKeypairPath = path.join(
      process.cwd(),
      ".switchboard",
      "oracle-authority-keypair.json"
    );
    const oracleAuthorityKeypair = await getOrCreateKeypair(
      provider,
      oracleAuthorityKeypairPath
    );

    const [oracleAccount] = await queueAccount.createOracle({
      name: "Oracle #1",
      stakeAmount: 0,
      enable: true,
      authority: oracleAuthorityKeypair,
    });
    console.log(`oracle: ${oracleAccount.publicKey}`);

    dockerOracle = new DockerOracle(
      {
        chain: "solana",
        network: "localnet",
        rpcUrl: provider.connection.rpcEndpoint.includes("localhost")
          ? provider.connection.rpcEndpoint.replace(
              "localhost",
              "host.docker.internal"
            )
          : provider.connection.rpcEndpoint.includes("0.0.0.0")
          ? provider.connection.rpcEndpoint.replace(
              "0.0.0.0",
              "host.docker.internal"
            )
          : provider.connection.rpcEndpoint,
        oracleKey: oracleAccount.publicKey.toBase58(),
        secretPath: oracleAuthorityKeypairPath,
      },
      "dev-v2-RC_01_17_23_16_22b-beta",
      undefined,
      true
    );

    console.log(`Starting Switchboard oracle ...`);

    await dockerOracle.startAndAwait();

    // switchboard = await Switchboard.load(provider);
    // if (!switchboard) {
    //   throw new Error(`Failed to load Switchboard`);
    // }
  });

  after(async () => {
    if (dockerOracle) {
      const stopped = dockerOracle.stop();
      if (!stopped) {
        console.error(`Failed to stop docker oracle`);

        // TODO: We can force kill it
      }
    }
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
      new anchor.BN(0),
      user2.switchTokenWallet
    );

    assert.rejects(async () => {
      await user2.user.placeBet(
        GameTypeValue.COIN_FLIP,
        1,
        new anchor.BN(0),
        user2.switchTokenWallet
      );
    }, new RegExp(/0x1775/g));
  });

  it("a new user rolls a 6 sided dice", async () => {
    const user3 = await createFlipUser(program);

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
    const user4 = await createFlipUser(program);

    assert.rejects(async () => {
      await user4.user.placeBetAndAwaitFlip(
        GameTypeValue.SIX_SIDED_DICE_ROLL,
        7,
        new anchor.BN(0),
        user4.switchTokenWallet,
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
    const user = await createFlipUser(program, 0);

    await user.user.placeBetAndAwaitFlip(
      GameTypeValue.COIN_FLIP,
      1,
      new anchor.BN(0),
      user.switchTokenWallet
    );
  });

  it("a new user flips a coin with a half empty wrapped SOL wallet", async () => {
    const user = await createFlipUser(program, 0.001);

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
    const newSwitchboardProgram = await SwitchboardProgram.fromProvider(
      flipProgram.provider as anchor.AnchorProvider
    );

    const user = await User.create(program);

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
  //         ...(await createFlipUser(program, switchboard.queue.account)),
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
