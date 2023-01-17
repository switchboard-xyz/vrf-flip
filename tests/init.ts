import { AnchorProvider } from "@project-serum/anchor";
import { Cluster, clusterApiUrl } from "@solana/web3.js";
import {
  SwitchboardNetwork,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import os from "os";
import path from "path";
import fs from "fs";

export const DEFAULT_KEYPAIR_PATH = path.join(
  os.homedir(),
  ".config/solana/id.json"
);

export function getCluster(
  rpcEndpoint: string
): Cluster | "localnet" | undefined {
  switch (rpcEndpoint) {
    case "http://localhost:8899":
      return "localnet";
    case clusterApiUrl("devnet"):
      return "devnet";
    case clusterApiUrl("mainnet-beta"):
      return "mainnet-beta";
    default:
      return undefined;
  }
}

export class Switchboard extends SwitchboardNetwork {
  private static _instances: Map<string, Promise<Switchboard>> = new Map();

  private constructor(network: SwitchboardNetwork, readonly name: string) {
    super(network);
  }

  public static load(
    provider: AnchorProvider,
    name = "default"
  ): Promise<Switchboard> {
    if (!this._instances.has(name)) {
      this._instances.set(
        name,
        new Promise(async (resolve, reject) => {
          try {
            const program = await SwitchboardProgram.fromProvider(provider);
            const switchboardNetwork = SwitchboardNetwork.find(program, name);

            // check if network has been created yet
            try {
              await switchboardNetwork.load();
            } catch (error) {
              // Error: invalid account discriminator
              await SwitchboardNetwork.create(
                program,
                JSON.parse(
                  fs.readFileSync(
                    path.join(
                      process.cwd(),
                      ".switchboard",
                      "networks",
                      `${name}.config.json`
                    ),
                    "utf8"
                  )
                )
              );
            }

            const switchboard = new Switchboard(switchboardNetwork, name);
            resolve(switchboard);
          } catch (error) {
            reject(error);
          }
        })
      );
    }

    return this._instances.get(name)!;
  }
}
