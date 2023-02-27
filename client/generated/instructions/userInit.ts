import { FlipProgram } from "../../program";
import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface UserInitArgs {
  params: types.UserInitParamsFields;
}

export interface UserInitAccounts {
  user: PublicKey;
  house: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  escrow: PublicKey;
  rewardAddress: PublicKey;
  vrf: PublicKey;
  payer: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  associatedTokenProgram: PublicKey;
  rent: PublicKey;
}

export const layout = borsh.struct([types.UserInitParams.layout("params")]);

export function userInit(
  program: { programId: PublicKey },
  args: UserInitArgs,
  accounts: UserInitAccounts
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.user, isSigner: false, isWritable: true },
    { pubkey: accounts.house, isSigner: false, isWritable: false },
    { pubkey: accounts.mint, isSigner: false, isWritable: true },
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    { pubkey: accounts.escrow, isSigner: true, isWritable: true },
    { pubkey: accounts.rewardAddress, isSigner: false, isWritable: true },
    { pubkey: accounts.vrf, isSigner: false, isWritable: true },
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
  const identifier = Buffer.from([155, 115, 91, 198, 177, 99, 132, 91]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.UserInitParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({
    keys,
    programId: program.programId,
    data,
  });
  return ix;
}
