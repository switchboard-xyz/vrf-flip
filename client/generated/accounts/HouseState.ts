import { FlipProgram } from "../../program";
import { PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface HouseStateFields {
  bump: number;
  authority: PublicKey;
  mint: PublicKey;
  houseVault: PublicKey;
  switchboardFunction: PublicKey;
  ebuf: Array<number>;
}

export interface HouseStateJSON {
  bump: number;
  authority: string;
  mint: string;
  houseVault: string;
  switchboardFunction: string;
  ebuf: Array<number>;
}

export class HouseState {
  readonly bump: number;
  readonly authority: PublicKey;
  readonly mint: PublicKey;
  readonly houseVault: PublicKey;
  readonly switchboardFunction: PublicKey;
  readonly ebuf: Array<number>;

  static readonly discriminator = Buffer.from([
    160, 248, 45, 36, 81, 236, 18, 77,
  ]);

  static readonly layout = borsh.struct([
    borsh.u8("bump"),
    borsh.publicKey("authority"),
    borsh.publicKey("mint"),
    borsh.publicKey("houseVault"),
    borsh.publicKey("switchboardFunction"),
    borsh.array(borsh.u8(), 1024, "ebuf"),
  ]);

  constructor(fields: HouseStateFields) {
    this.bump = fields.bump;
    this.authority = fields.authority;
    this.mint = fields.mint;
    this.houseVault = fields.houseVault;
    this.switchboardFunction = fields.switchboardFunction;
    this.ebuf = fields.ebuf;
  }

  static async fetch(
    program: { connection: Connection; programId: PublicKey },
    address: PublicKey,
    programId: PublicKey = program.programId
  ): Promise<HouseState | null> {
    const info = await program.connection.getAccountInfo(address);

    if (info === null) {
      return null;
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program");
    }

    return this.decode(info.data);
  }

  static async fetchMultiple(
    program: { connection: Connection; programId: PublicKey },
    addresses: PublicKey[],
    programId: PublicKey = program.programId
  ): Promise<Array<HouseState | null>> {
    const infos = await program.connection.getMultipleAccountsInfo(addresses);

    return infos.map((info) => {
      if (info === null) {
        return null;
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program");
      }

      return this.decode(info.data);
    });
  }

  static decode(data: Buffer): HouseState {
    if (!data.slice(0, 8).equals(HouseState.discriminator)) {
      throw new Error("invalid account discriminator");
    }

    const dec = HouseState.layout.decode(data.slice(8));

    return new HouseState({
      bump: dec.bump,
      authority: dec.authority,
      mint: dec.mint,
      houseVault: dec.houseVault,
      switchboardFunction: dec.switchboardFunction,
      ebuf: dec.ebuf,
    });
  }

  toJSON(): HouseStateJSON {
    return {
      bump: this.bump,
      authority: this.authority.toString(),
      mint: this.mint.toString(),
      houseVault: this.houseVault.toString(),
      switchboardFunction: this.switchboardFunction.toString(),
      ebuf: this.ebuf,
    };
  }

  static fromJSON(obj: HouseStateJSON): HouseState {
    return new HouseState({
      bump: obj.bump,
      authority: new PublicKey(obj.authority),
      mint: new PublicKey(obj.mint),
      houseVault: new PublicKey(obj.houseVault),
      switchboardFunction: new PublicKey(obj.switchboardFunction),
      ebuf: obj.ebuf,
    });
  }
}
