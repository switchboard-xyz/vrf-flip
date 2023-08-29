import { FlipProgram } from "../../program";
import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface UserBetArgs {
  params: types.UserBetParamsFields;
}

export interface UserBetAccounts {
  user: PublicKey;
  house: PublicKey;
  houseVault: PublicKey;
  authority: PublicKey;
  escrow: PublicKey;
  switchboardMint: PublicKey;
  switchboardFunction: PublicKey;
  switchboardRequest: PublicKey;
  switchboardRequestEscrow: PublicKey;
  switchboardState: PublicKey;
  switchboardAttestationQueue: PublicKey;
  switchboard: PublicKey;
  payer: PublicKey;
  flipPayer: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
}

export const layout = borsh.struct([types.UserBetParams.layout("params")]);

export function userBet(
  program: { programId: PublicKey },
  args: UserBetArgs,
  accounts: UserBetAccounts,
  programId: PublicKey = program.programId
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.user, isSigner: false, isWritable: true },
    { pubkey: accounts.house, isSigner: false, isWritable: false },
    { pubkey: accounts.houseVault, isSigner: false, isWritable: false },
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    { pubkey: accounts.escrow, isSigner: false, isWritable: true },
    { pubkey: accounts.switchboardMint, isSigner: false, isWritable: false },
    { pubkey: accounts.switchboardFunction, isSigner: false, isWritable: true },
    { pubkey: accounts.switchboardRequest, isSigner: false, isWritable: true },
    {
      pubkey: accounts.switchboardRequestEscrow,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.switchboardState, isSigner: false, isWritable: false },
    {
      pubkey: accounts.switchboardAttestationQueue,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.switchboard, isSigner: false, isWritable: false },
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.flipPayer, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([250, 141, 121, 127, 113, 52, 188, 61]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.UserBetParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
