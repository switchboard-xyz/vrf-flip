import { Keypair } from "@solana/web3.js";
import path from "path";
import fs from "fs";
import os from "os";
import { SwitchboardTestContextV2Init } from "@switchboard-xyz/solana.js";

export function loadKeypair(keypairPath: string): Keypair {
  const fullPath =
    keypairPath.startsWith("/") || keypairPath.startsWith("C:")
      ? keypairPath
      : keypairPath.startsWith("~")
      ? os.homedir() + keypairPath.slice(1)
      : path.join(process.cwd(), keypairPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Keypair does not exist`);
  }
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(fullPath, "utf-8")))
  );
}

// TIP: You can define a keypair in order to create the same queue + oracle each run.
// This is useful for debugging
export const VRF_FLIP_NETWORK: SwitchboardTestContextV2Init = {
  name: "VRF Flip Queue",
  //   keypair: loadKeypair("./my_queue_keypair.json"),
  queueSize: 10,
  reward: 0,
  minStake: 0,
  oracleTimeout: 900,
  unpermissionedFeeds: true,
  unpermissionedVrf: true,
  enableBufferRelayers: true,
  oracle: {
    name: "VRF Flip Oracle",
    enable: true,
    // stakingWalletKeypair: Keypair.fromSecretKey(
    //   new Uint8Array([
    //     67, 131, 239, 47, 118, 122, 163, 132, 42, 122, 203, 119, 213, 213, 100,
    //     75, 231, 52, 223, 48, 24, 210, 237, 170, 53, 148, 5, 156, 177, 174, 55,
    //     104, 150, 48, 4, 175, 217, 217, 90, 71, 189, 153, 51, 139, 210, 112,
    //     138, 167, 3, 190, 119, 20, 1, 68, 148, 4, 186, 96, 127, 24, 38, 128,
    //     189, 75,
    //   ])
    // ),
  },
};
