import { FlipProgram } from "../../program";
import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface HouseInitArgs {
  params: types.HouseInitParamsFields;
}

export interface HouseInitAccounts {
  house: PublicKey;
  authority: PublicKey;
  switchboardFunction: PublicKey;
  mint: PublicKey;
  houseVault: PublicKey;
  payer: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  associatedTokenProgram: PublicKey;
  rent: PublicKey;
}

export const layout = borsh.struct([types.HouseInitParams.layout("params")]);

export function houseInit(
  program: { programId: PublicKey },
  args: HouseInitArgs,
  accounts: HouseInitAccounts,
  programId: PublicKey = program.programId
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.house, isSigner: false, isWritable: true },
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    {
      pubkey: accounts.switchboardFunction,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.mint, isSigner: true, isWritable: true },
    { pubkey: accounts.houseVault, isSigner: false, isWritable: true },
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.associatedTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([195, 3, 56, 49, 181, 185, 169, 109]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.HouseInitParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
