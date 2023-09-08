import { PublicKey } from "@solana/web3.js";
import {
  AttestationQueueAccount,
  DEVNET_GENESIS_HASH,
  FunctionAccount,
  FunctionRequestAccount,
  SwitchboardProgram,
  loadKeypair,
} from "@switchboard-xyz/solana.js";
import * as anchor from "@coral-xyz/anchor";
import { SwitchboardVrfFlip } from "../target/types/switchboard_vrf_flip";
import { parseRawMrEnclave, sleep } from "@switchboard-xyz/common";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const MrEnclave: Uint8Array | undefined = process.env.MR_ENCLAVE
  ? parseRawMrEnclave(process.env.MR_ENCLAVE)
  : fs.existsSync("measurement.txt")
  ? parseRawMrEnclave(fs.readFileSync("measurement.txt", "utf-8").trim())
  : undefined;

(async () => {
  if (!MrEnclave) {
    throw new Error(
      `Failed to read MrEnclave value from measurement.txt. Try running 'make build' to generate the measurement`
    );
  }
  if (!process.env.SWITCHBOARD_FUNCTION_PUBKEY) {
    throw new Error(
      `Need to define $SWITCHBOARD_FUNCTION_PUBKEY in your .env file`
    );
  }
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(
    process.argv.length > 2
      ? new anchor.AnchorProvider(
          provider.connection,
          new anchor.Wallet(loadKeypair(process.argv[2])),
          {}
        )
      : provider
  );
  const payer = (provider.wallet as anchor.Wallet).payer;

  const program: anchor.Program<SwitchboardVrfFlip> =
    anchor.workspace.SwitchboardVrfFlip;

  const switchboardProgram = await SwitchboardProgram.fromProvider(provider);

  const [switchboardFunction, functionState] = await FunctionAccount.load(
    switchboardProgram,
    process.env.SWITCHBOARD_FUNCTION_PUBKEY
  );
  if (!functionState.authority.equals(payer.publicKey)) {
    throw new Error(
      `$SWITCHBOARD_FUNCTION_PUBKEY.authority mismatch, expected ${payer.publicKey}, received ${functionState.authority}`
    );
  }

  let functionMrEnclaves = functionState.mrEnclaves.filter(
    (b) =>
      Buffer.compare(Buffer.from(b), Buffer.from(new Array(32).fill(0))) !== 0
  );
  // if we need to, add MrEnclave measurement
  const mrEnclaveIdx = functionMrEnclaves.findIndex(
    (b) => Buffer.compare(Buffer.from(b), Buffer.from(MrEnclave)) === 0
  );
  if (mrEnclaveIdx === -1) {
    console.log(
      `MrEnclave missing from Function, adding to function config ...`
    );
    // we need to add the MrEnclave measurement
    const mrEnclavesLen = functionMrEnclaves.push(Array.from(MrEnclave));
    if (mrEnclavesLen > 32) {
      functionMrEnclaves = functionMrEnclaves.slice(32 - mrEnclavesLen);
    }
    const functionSetConfigTx = await switchboardFunction.setConfig({
      mrEnclaves: functionMrEnclaves,
    });
    console.log(`[TX] function_set_config: ${functionSetConfigTx}`);
  } else {
    console.log(`MrEnclave already in Function config, no action needed.`);
  }
})();
