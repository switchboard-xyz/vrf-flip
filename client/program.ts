import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionSignature,
} from "@solana/web3.js";
import {
  Mint,
  SwitchboardProgram,
  FunctionAccount,
  AnchorWallet,
  TransactionObject,
  SendTransactionOptions,
  DEFAULT_SEND_TRANSACTION_OPTIONS,
  TransactionOptions,
  SB_V2_PID,
} from "@switchboard-xyz/solana.js";
import { HouseState } from "./generated/accounts";
import { House } from "./house";

export class FlipProgram {
  constructor(
    readonly program: anchor.Program,
    readonly house: House,
    readonly mint: Mint,
    readonly switchboardFunction: FunctionAccount
  ) {}

  get idl(): anchor.Idl {
    return this.program.idl;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  get switchboard(): SwitchboardProgram {
    return this.switchboardFunction.program;
  }

  get provider(): anchor.AnchorProvider {
    return this.program.provider as anchor.AnchorProvider;
  }

  get connection(): Connection {
    return this.provider.connection;
  }

  get payer(): Keypair {
    return (this.provider.wallet as AnchorWallet).payer;
  }

  get payerPubkey(): PublicKey {
    return this.payer.publicKey;
  }

  static async init(
    program: anchor.Program,
    switchboardFunction: FunctionAccount,
    mintKeypair: Keypair
  ): Promise<FlipProgram> {
    const house = await House.create(program, switchboardFunction, mintKeypair);
    const mint = await house.loadMint();
    return new FlipProgram(program, house, mint, switchboardFunction);
  }

  static async load(
    program: anchor.Program,
    params?: {
      queuePubkey?: PublicKey;
      mintKeypair?: Keypair;
    }
  ): Promise<FlipProgram> {
    const switchboard = await SwitchboardProgram.fromProvider(
      program.provider as anchor.AnchorProvider,
      SB_V2_PID
    );

    const [houseKey] = House.fromSeeds(program.programId);
    const houseState = await HouseState.fetch(
      {
        connection: program.provider.connection,
        programId: program.programId,
      },
      houseKey
    );

    // create the house if not created yet
    if (houseState === null) {
      if (!params?.queuePubkey) {
        throw new Error(
          `Must provide queuePubkey to create a new house account`
        );
      }
      const switchboardFunction = new FunctionAccount(
        switchboard,
        params.queuePubkey
      );
      return await FlipProgram.init(
        program,
        switchboardFunction,
        params?.mintKeypair ? params.mintKeypair : Keypair.generate()
      );
    } else {
      const house = new House(program, houseKey, houseState);
      const mint = await house.loadMint();
      const switchboardFunction = new FunctionAccount(
        switchboard,
        house.state.switchboardFunction
      );
      return new FlipProgram(program, house, mint, switchboardFunction);
    }
  }

  public async signAndSendAll(
    txns: Array<TransactionObject>,
    opts: SendTransactionOptions = DEFAULT_SEND_TRANSACTION_OPTIONS,
    txnOptions?: TransactionOptions,
    delay = 0
  ): Promise<Array<TransactionSignature>> {
    const signatures = await this.switchboard.signAndSendAll(
      txns,
      opts,
      txnOptions,
      delay
    );
    return signatures;
  }

  public async signAndSend(
    txn: TransactionObject,
    opts: SendTransactionOptions = DEFAULT_SEND_TRANSACTION_OPTIONS,
    txnOptions?: TransactionOptions
  ): Promise<TransactionSignature> {
    const signature = await this.switchboard.signAndSend(txn, opts, txnOptions);
    return signature;
  }
}
