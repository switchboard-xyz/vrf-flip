import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import { promiseWithTimeout, sleep } from "@switchboard-xyz/common";
import {
  FunctionRequestAccount,
  FunctionAccount,
  SwitchboardProgram,
  TransactionObject,
} from "@switchboard-xyz/solana.js";
import { UserState, UserStateJSON } from "./generated/accounts";
import { userAirdrop, userBet, userInit } from "./generated/instructions";
import { House } from "./house";
import { FlipProgram } from "./program";
import { convertGameType, GameTypeEnum, GameTypeValue } from "./types";
import { verifyPayerBalance } from "./utils";

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
    const userState = await UserState.fetch(program, userKey);
    if (!userState) {
      throw new Error(`User account does not exist`);
    }

    return new User(program, userKey, userState);
  }

  getRequestAccount(
    switchboardProgram: SwitchboardProgram
  ): FunctionRequestAccount {
    const requestAccount = new FunctionRequestAccount(
      switchboardProgram,
      this.state.switchboardRequest
    );
    return requestAccount;
  }

  async getFunctionAccount(
    switchboardProgram: SwitchboardProgram
  ): Promise<FunctionAccount> {
    const requestAccount = this.getRequestAccount(switchboardProgram);
    const requestState = await requestAccount.loadData();
    const functionAccount = new FunctionAccount(
      switchboardProgram,
      requestState.function
    );
    return functionAccount;
  }

  static fromSeeds(
    program: FlipProgram,
    authority: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("USERSEED"),
        program.house.publicKey.toBytes(),
        authority.toBytes(),
      ],
      program.programId
    );
  }

  async reload(): Promise<void> {
    const newState = await UserState.fetch(this.program, this.publicKey);
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

  static async create(program: FlipProgram): Promise<User> {
    const [userInitTxn, userKey] = await User.createReq(program);
    const signatures = await program.signAndSend(
      userInitTxn,
      {
        skipPreflight: true,
      },
      undefined
    );

    let retryCount = 5;
    while (retryCount) {
      const userState = await UserState.fetch(program, userKey);
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
  ): Promise<[TransactionObject, PublicKey]> {
    // try {
    //   await verifyPayerBalance(
    //     program.provider.connection,
    //     payerPubkey,
    //     0.3 * LAMPORTS_PER_SOL
    //   );
    // } catch {}

    const escrowKeypair = anchor.web3.Keypair.generate();

    const [userKey] = User.fromSeeds(program, payerPubkey);

    const rewardAddress = program.mint.getAssociatedAddress(payerPubkey);

    const houseAccount = await House.getOrCreate(program.program);
    const switchboardFunction = houseAccount.getFunctionAccount(
      program.switchboard
    );
    const functionState = await switchboardFunction.loadData();

    const requestKeypair = anchor.web3.Keypair.generate();
    const switchboardRequestEscrow =
      switchboardFunction.program.mint.getAssociatedAddress(
        requestKeypair.publicKey
      );

    const userInitTxn = new TransactionObject(
      payerPubkey,
      [
        userInit(
          program,
          {
            params: {},
          },
          {
            user: userKey,
            house: houseAccount.publicKey,
            mint: program.mint.address,
            authority: payerPubkey,
            escrow: escrowKeypair.publicKey,
            rewardAddress: rewardAddress,
            switchboardFunction: houseAccount.state.switchboardFunction,
            switchboardMint: switchboardFunction.program.mint.address,
            switchboardRequest: requestKeypair.publicKey,
            switchboardRequestEscrow,
            switchboardState:
              switchboardFunction.program.attestationProgramState.publicKey,
            switchboardAttestationQueue: functionState.attestationQueue,
            switchboard: switchboardFunction.program.attestationProgramId,
            payer: payerPubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          }
        ),
      ],
      [escrowKeypair, requestKeypair],
      {
        computeUnitLimit: 250_000,
      }
    );

    return [userInitTxn, userKey];
  }

  async placeBet(
    gameType: GameTypeValue,
    userGuess: number,
    betAmount: anchor.BN
  ): Promise<TransactionSignature> {
    const betTxn = await this.placeBetReq(
      gameType,
      userGuess,
      betAmount,
      this.program.switchboard.walletPubkey
    );
    const signature = await this.program.switchboard.signAndSend(betTxn);
    return signature;
  }

  async placeBetReq(
    gameType: GameTypeValue,
    userGuess: number,
    betAmount: anchor.BN,
    payerPubkey = this.program.payerPubkey
  ): Promise<TransactionObject> {
    // try {
    //   await verifyPayerBalance(this.program.provider.connection, payerPubkey);
    // } catch {}

    const functionAccount = new FunctionAccount(
      this.program.switchboard,
      this.program.house.state.switchboardFunction
    );
    const functionState = await functionAccount.loadData();

    const betIxn = userBet(
      this.program,
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
        switchboardMint: functionAccount.program.mint.address,
        switchboardFunction: functionAccount.publicKey,
        switchboardRequest: this.state.switchboardRequest,
        switchboardRequestEscrow:
          functionAccount.program.mint.getAssociatedAddress(
            this.state.switchboardRequest
          ),
        switchboardState:
          functionAccount.program.attestationProgramState.publicKey,
        switchboardAttestationQueue: functionState.attestationQueue,
        switchboard: functionAccount.program.attestationProgramId,
        payer: payerPubkey,
        flipPayer: this.state.rewardAddress,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      }
    );

    return new TransactionObject(payerPubkey, [betIxn], []);
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
      `flip user failed to update in ${timeout} seconds`
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
    timeout = 30
  ): Promise<UserState> {
    await this.reload();
    const currentCounter = this.state.currentRound.roundId;

    try {
      const placeBetTxn = await this.placeBet(gameType, userGuess, betAmount);
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
      this.program,
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
