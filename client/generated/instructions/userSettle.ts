import { FlipProgram } from "../../program";
import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface UserSettleArgs {
  params: types.UserSettleParamsFields;
}

export interface UserSettleAccounts {
  user: PublicKey;
  house: PublicKey;
  escrow: PublicKey;
  rewardAddress: PublicKey;
  houseVault: PublicKey;
  switchboardFunction: PublicKey;
  switchboardRequest: PublicKey;
  enclaveSigner: PublicKey;
  tokenProgram: PublicKey;
}

export const layout = borsh.struct([types.UserSettleParams.layout("params")]);

export function userSettle(
  program: { programId: PublicKey },
  args: UserSettleArgs,
  accounts: UserSettleAccounts,
  programId: PublicKey = program.programId
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.user, isSigner: false, isWritable: true },
    { pubkey: accounts.house, isSigner: false, isWritable: false },
    { pubkey: accounts.escrow, isSigner: false, isWritable: true },
    { pubkey: accounts.rewardAddress, isSigner: false, isWritable: true },
    { pubkey: accounts.houseVault, isSigner: false, isWritable: true },
    {
      pubkey: accounts.switchboardFunction,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.switchboardRequest, isSigner: false, isWritable: false },
    { pubkey: accounts.enclaveSigner, isSigner: true, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([184, 56, 135, 64, 228, 26, 152, 183]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.UserSettleParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
