import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  TransactionSignature,
} from "@solana/web3.js";
import { promiseWithTimeout, sleep } from "@switchboard-xyz/common";
import {
  Callback,
  PermissionAccount,
  QueueAccount,
  SwitchboardProgram,
  TransactionObject,
  VrfAccount,
} from "@switchboard-xyz/solana.js";
import { UserState, UserStateJSON } from "./generated/accounts";
import { userAirdrop, userBet, userInit } from "./generated/instructions";
import { House } from "./house";
import { FlipProgram } from "./program";
import { convertGameType, GameTypeEnum, GameTypeValue } from "./types";
import { programWallet, verifyPayerBalance } from "./utils";

export interface UserBetPlaced {
  roundId: anchor.BN;
  user: PublicKey;
  gameType: GameTypeEnum;
  betAmount: anchor.BN;
  guess: number;
  slot: number;
  timestamp: anchor.BN;
}

export interface UserBetSettled {
  roundId: anchor.BN;
  user: PublicKey;
  userWon: boolean;
  gameType: GameTypeEnum;
  betAmount: anchor.BN;
  escrowChange: anchor.BN;
  guess: number;
  result: number;
  slot: number;
  timestamp: anchor.BN;
}

export interface UserJSON extends UserStateJSON {
  publicKey: string;
}

const VRF_REQUEST_AMOUNT = new anchor.BN(2_000_000);

export class User {
  state: UserState;
  private readonly _programEventListeners: number[] = [];

  constructor(
    readonly program: FlipProgram,
    readonly publicKey: PublicKey,
    state: UserState
  ) {
    this.state = state;
  }

  static async load(program: FlipProgram, authority: PublicKey): Promise<User> {
    const [houseKey] = House.fromSeeds(program.programId);
    const [userKey] = User.fromSeeds(program, authority);
    const userState = await UserState.fetch(
      program.provider.connection,
      userKey
    );
    if (!userState) {
      throw new Error(`User account does not exist`);
    }

    return new User(program, userKey, userState);
  }

  getVrfAccount(switchboardProgram: SwitchboardProgram): VrfAccount {
    const vrfAccount = new VrfAccount(switchboardProgram, this.state.vrf);
    return vrfAccount;
  }

  async getQueueAccount(
    switchboardProgram: SwitchboardProgram
  ): Promise<QueueAccount> {
    const vrfAccount = this.getVrfAccount(switchboardProgram);
    const vrfState = await vrfAccount.loadData();
    const queueAccount = new QueueAccount(
      switchboardProgram,
      vrfState.oracleQueue
    );
    return queueAccount;
  }

  static fromSeeds(
    program: FlipProgram,
    authority: PublicKey
  ): [PublicKey, number] {
    return anchor.utils.publicKey.findProgramAddressSync(
      [
        Buffer.from("USERSTATESEED"),
        program.house.publicKey.toBytes(),
        authority.toBytes(),
      ],
      program.programId
    );
  }

  async reload(): Promise<void> {
    const newState = await UserState.fetch(
      this.program.provider.connection,
      this.publicKey
    );
    if (newState === null) {
      throw new Error(`Failed to fetch the new User account state`);
    }
    this.state = newState;
  }

  toJSON(): UserJSON {
    return {
      publicKey: this.publicKey.toString(),
      ...this.state.toJSON(),
    };
  }

  static async getCallback(
    program: FlipProgram,
    user: PublicKey,
    escrow: PublicKey,
    vrf: PublicKey,
    rewardAddress: PublicKey
  ): Promise<Callback> {
    const ixnCoder = new anchor.BorshInstructionCoder(program.idl);
    const callback: Callback = {
      programId: program.programId,
      ixData: ixnCoder.encode("userSettle", {}),
      accounts: [
        {
          pubkey: user,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: program.house.publicKey,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: escrow,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: rewardAddress,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: program.house.state.houseVault,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: vrf,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: spl.TOKEN_PROGRAM_ID,
          isWritable: false,
          isSigner: false,
        },
      ],
    };
    return callback;
  }

  static async create(program: FlipProgram): Promise<User> {
    const [userInitTxns, userKey] = await User.createReq(program);
    const signatures = await program.signAndSendAll(
      userInitTxns,
      {
        skipPreflight: true,
      },
      undefined,
      50
    );

    let retryCount = 5;
    while (retryCount) {
      const userState = await UserState.fetch(
        program.provider.connection,
        userKey
      );
      if (userState !== null) {
        return new User(program, userKey, userState);
      }
      await sleep(1000);
      --retryCount;
    }

    throw new Error(`Failed to create new UserAccount`);
  }

  static async createReq(
    program: FlipProgram,
    payerPubkey = program.payerPubkey
  ): Promise<[Array<TransactionObject>, PublicKey]> {
    try {
      await verifyPayerBalance(
        program.provider.connection,
        payerPubkey,
        0.3 * LAMPORTS_PER_SOL
      );
    } catch {}

    const queue = await program.queue.loadData();

    const escrowKeypair = anchor.web3.Keypair.generate();
    const vrfSecret = anchor.web3.Keypair.generate();

    const [userKey, userBump] = User.fromSeeds(program, payerPubkey);
    const rewardAddress = program.mint.getAssociatedAddress(payerPubkey);
    console.log(`reward: ${rewardAddress}`);

    const callback = await User.getCallback(
      program,
      userKey,
      escrowKeypair.publicKey,
      vrfSecret.publicKey,
      rewardAddress
    );

    const [vrfAccount, vrfInit] = await program.queue.createVrfInstructions(
      payerPubkey,
      {
        vrfKeypair: vrfSecret,
        callback: callback,
        authority: userKey,
        enable: false, // enable if queue has unpermissionedVrfEnabled set to false
      }
    );

    const [permissionAccount, permissionBump] = PermissionAccount.fromSeed(
      program.switchboard,
      queue.authority,
      program.queue.publicKey,
      vrfAccount.publicKey
    );

    console.log({
      user: userKey.toBase58(),
      house: program.house.publicKey.toBase58(),
      mint: program.mint.address.toBase58(),
      authority: payerPubkey.toBase58(),
      escrow: escrowKeypair.publicKey.toBase58(),
      rewardAddress: rewardAddress.toBase58(),
      vrf: vrfAccount.publicKey.toBase58(),
      payer: payerPubkey.toBase58(),
      systemProgram: anchor.web3.SystemProgram.programId.toBase58(),
      tokenProgram: spl.TOKEN_PROGRAM_ID.toBase58(),
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      rent: anchor.web3.SYSVAR_RENT_PUBKEY.toBase58(),
    });

    const vrfClientInitTxn = new TransactionObject(
      payerPubkey,
      [
        userInit(
          {
            params: {
              switchboardStateBump: program.switchboard.programState.bump,
              vrfPermissionBump: permissionBump,
            },
          },
          {
            user: userKey,
            house: program.house.publicKey,
            mint: program.mint.address,
            authority: payerPubkey,
            escrow: escrowKeypair.publicKey,
            rewardAddress: rewardAddress,
            vrf: vrfAccount.publicKey,
            payer: payerPubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          }
        ),
      ],
      [escrowKeypair]
    );

    return [TransactionObject.pack([vrfInit, vrfClientInitTxn]), userKey];
  }

  async placeBet(
    gameType: GameTypeValue,
    userGuess: number,
    betAmount: anchor.BN,
    payerPubkey = this.program.payerPubkey
  ): Promise<TransactionSignature> {
    const betTxn = await this.placeBetReq(
      gameType,
      userGuess,
      betAmount,
      payerPubkey
    );
    const signature = await this.program.switchboard.signAndSend(betTxn);
    return signature;
  }

  async placeBetReq(
    gameType: GameTypeValue,
    userGuess: number,
    betAmount: anchor.BN,
    payerPubkey = programWallet(this.program as any).publicKey
  ): Promise<TransactionObject> {
    try {
      await verifyPayerBalance(this.program.provider.connection, payerPubkey);
    } catch {}

    const vrfAccount = new VrfAccount(this.program.switchboard, this.state.vrf);
    const vrfAccounts = await vrfAccount.fetchAccounts();

    const [payerWrappedWallet, wrapTxn] =
      await this.program.switchboard.mint.getOrCreateWrappedUserInstructions(
        payerPubkey,
        {
          fundUpTo: 0.002,
        }
      );

    const betIxn = userBet(
      {
        params: {
          gameType: gameType,
          userGuess,
          betAmount,
        },
      },
      {
        user: this.publicKey,
        house: this.state.house,
        houseVault: this.program.house.state.houseVault,
        authority: this.state.authority,
        escrow: this.state.escrow,
        vrf: vrfAccount.publicKey,
        oracleQueue: vrfAccounts.queue.publicKey,
        queueAuthority: vrfAccounts.queue.data.authority,
        dataBuffer: vrfAccounts.queue.data.dataBuffer,
        permission: vrfAccounts.permission.publicKey,
        vrfEscrow: vrfAccounts.escrow.publicKey,
        switchboardProgramState: vrfAccount.program.programState.publicKey,
        switchboardProgram: vrfAccount.program.programId,
        payer: payerPubkey,
        vrfPayer: payerWrappedWallet,
        flipPayer: this.state.rewardAddress,
        recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      }
    );

    return wrapTxn
      ? wrapTxn.add(betIxn)
      : new TransactionObject(payerPubkey, [betIxn], []);
  }

  async awaitFlip(
    expectedCounter: anchor.BN,
    timeout = 30
  ): Promise<UserState> {
    let accountWs: number;
    const awaitUpdatePromise = new Promise(
      (resolve: (value: UserState) => void) => {
        accountWs = this.program.provider.connection.onAccountChange(
          this?.publicKey ?? PublicKey.default,
          async (accountInfo) => {
            const user = UserState.decode(accountInfo.data);
            if (!expectedCounter.eq(user.currentRound.roundId)) {
              return;
            }
            if (user.currentRound.result === 0) {
              return;
            }
            resolve(user);
          }
        );
      }
    );

    const result = await promiseWithTimeout(
      timeout * 1000,
      awaitUpdatePromise,
      new Error(`flip user failed to update in ${timeout} seconds`)
    ).finally(() => {
      if (accountWs) {
        this.program.provider.connection.removeAccountChangeListener(accountWs);
      }
    });

    if (!result) {
      throw new Error(`failed to update flip user`);
    }

    return result;
  }

  async placeBetAndAwaitFlip(
    gameType: GameTypeValue,
    userGuess: number,
    betAmount: anchor.BN,
    switchboardTokenAccount?: PublicKey,
    timeout = 30
  ): Promise<UserState> {
    await this.reload();
    const currentCounter = this.state.currentRound.roundId;

    try {
      const placeBetTxn = await this.placeBet(
        gameType,
        userGuess,
        betAmount,
        switchboardTokenAccount
      );
    } catch (error) {
      console.error(error);
      throw error;
    }

    try {
      const userState = await this.awaitFlip(
        currentCounter.add(new anchor.BN(1)),
        timeout
      );
      return userState;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  isWinner(userState?: UserState): boolean {
    const state = userState ?? this.state;
    if (state.currentRound.result === 0) {
      return false;
    }
    return state.currentRound.guess === state.currentRound.result;
  }

  async airdropReq(
    payerPubkey = this.program.payerPubkey
  ): Promise<TransactionObject> {
    try {
      await verifyPayerBalance(this.program.provider.connection, payerPubkey);
    } catch {}

    const payerFlipTokenAccount = await this.program.mint.getAssociatedAccount(
      payerPubkey
    );

    const airdropIxn = userAirdrop(
      { params: {} },
      {
        user: this.publicKey,
        house: this.program.house.publicKey,
        houseVault: this.program.house.state.houseVault,
        mint: this.program.mint.address,
        authority: payerPubkey,
        airdropTokenWallet: payerFlipTokenAccount.address,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      }
    );

    if (payerFlipTokenAccount === null) {
      const [userInitTxn] =
        this.program.mint.createAssocatedUserInstruction(payerPubkey);
      return userInitTxn.add(airdropIxn);
    }

    return new TransactionObject(payerPubkey, [airdropIxn], []);
  }

  async airdrop(
    payerPubkey = this.program.payerPubkey
  ): Promise<TransactionSignature> {
    const airdropTxn = await this.airdropReq(payerPubkey);
    const signature = await this.program.signAndSend(airdropTxn);
    return signature;
  }

  watch(
    betPlaced: (event: UserBetPlaced) => Promise<void> | void,
    betSettled: (event: UserBetSettled) => Promise<void> | void
  ) {
    this._programEventListeners.push(
      this.program.program.addEventListener(
        "UserBetPlaced",
        async (event: UserBetPlaced, slot: number, signature: string) => {
          if (!this.publicKey.equals(event.user)) {
            return;
          }
          const gameType = GameTypeValue.COIN_FLIP;
          await betPlaced({
            ...event,
            gameType: convertGameType(event.gameType),
          });
        }
      )
    );

    this._programEventListeners.push(
      this.program.program.addEventListener(
        "UserBetSettled",
        async (event: UserBetSettled, slot: number, signature: string) => {
          if (!this.publicKey.equals(event.user)) {
            return;
          }
          await betSettled({
            ...event,
            gameType: convertGameType(event.gameType),
          });
        }
      )
    );
  }

  async unwatch() {
    while (this._programEventListeners.length) {
      const id = this._programEventListeners.pop();
      if (Number.isFinite(id))
        await this.program.program.removeEventListener(id);
    }
  }
}
