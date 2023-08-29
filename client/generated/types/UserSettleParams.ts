import { FlipProgram } from "../../program";
import { PublicKey } from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh";

export interface UserSettleParamsFields {
  result: number;
}

export interface UserSettleParamsJSON {
  result: number;
}

export class UserSettleParams {
  readonly result: number;

  constructor(fields: UserSettleParamsFields) {
    this.result = fields.result;
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u32("result")], property);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new UserSettleParams({
      result: obj.result,
    });
  }

  static toEncodable(fields: UserSettleParamsFields) {
    return {
      result: fields.result,
    };
  }

  toJSON(): UserSettleParamsJSON {
    return {
      result: this.result,
    };
  }

  static fromJSON(obj: UserSettleParamsJSON): UserSettleParams {
    return new UserSettleParams({
      result: obj.result,
    });
  }

  toEncodable() {
    return UserSettleParams.toEncodable(this);
  }
}
