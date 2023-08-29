import { FlipProgram } from "../../program";
import { PublicKey } from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh";

export interface UserInitParamsFields {}

export interface UserInitParamsJSON {}

export class UserInitParams {
  constructor(fields: UserInitParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new UserInitParams({});
  }

  static toEncodable(fields: UserInitParamsFields) {
    return {};
  }

  toJSON(): UserInitParamsJSON {
    return {};
  }

  static fromJSON(obj: UserInitParamsJSON): UserInitParams {
    return new UserInitParams({});
  }

  toEncodable() {
    return UserInitParams.toEncodable(this);
  }
}
