import { PublicKey } from "@solana/web3.js";
import {
  AttestationQueueAccount,
  DEVNET_GENESIS_HASH,
  FunctionAccount,
  FunctionRequestAccount,
  MAINNET_GENESIS_HASH,
  SwitchboardProgram,
  loadKeypair,
} from "@switchboard-xyz/solana.js";
import * as anchor from "@coral-xyz/anchor";
import { SwitchboardVrfFlip } from "../target/types/switchboard_vrf_flip";
import { parseRawMrEnclave, sleep } from "@switchboard-xyz/common";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// const CONTAINER_NAME =
//   process.env.CONTAINER_NAME ?? "gallynaut/solana-vrf-flip";

const MrEnclave: Uint8Array | undefined = process.env.MR_ENCLAVE
  ? parseRawMrEnclave(process.env.MR_ENCLAVE)
  : fs.existsSync("measurement.txt")
  ? parseRawMrEnclave(fs.readFileSync("measurement.txt", "utf-8").trim())
  : undefined;

(async () => {
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
  console.log(`PAYER: ${payer.publicKey}`);

  const program: anchor.Program<SwitchboardVrfFlip> =
    anchor.workspace.SwitchboardVrfFlip;

  const switchboardProgram = await SwitchboardProgram.fromProvider(provider);

  const [housePubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("HOUSESEED")],
    program.programId
  );
  console.log(`HOUSE: ${housePubkey}`);

  // verify House is created and load Switchboard Function
  let switchboardFunction: FunctionAccount;
  let flipMintPubkey: PublicKey;
  let houseVaultPubkey: PublicKey;
  let attestationQueuePubkey: PublicKey;

  try {
    const houseState = await program.account.houseState.fetch(housePubkey);
    console.log(`HOUSE already initialized`);
    console.log(`FUNCTION: ${houseState.switchboardFunction}`);

    flipMintPubkey = houseState.mint;
    houseVaultPubkey = houseState.houseVault;

    switchboardFunction = new FunctionAccount(
      switchboardProgram,
      houseState.switchboardFunction
    );
    const functionState = await switchboardFunction.loadData();
    attestationQueuePubkey = functionState.attestationQueue;

    if (MrEnclave && MrEnclave.byteLength === 32) {
      let functionMrEnclaves = functionState.mrEnclaves.filter(
        (b) =>
          Buffer.compare(Buffer.from(b), Buffer.from(new Array(32).fill(0))) !==
          0
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
      }
    }
  } catch (error) {
    if (!`${error}`.includes("Account does not exist or has no data")) {
      throw error;
    }

    // Attempt to load from env file
    if (process.env.SWITCHBOARD_FUNCTION_PUBKEY) {
      try {
        const myFunction = new FunctionAccount(
          switchboardProgram,
          process.env.SWITCHBOARD_FUNCTION_PUBKEY
        );
        const functionState = await myFunction.loadData();
        if (functionState.authority.equals(payer.publicKey)) {
          throw new Error(
            `$SWITCHBOARD_FUNCTION_PUBKEY.authority mismatch, expected ${payer.publicKey}, received ${functionState.authority}`
          );
        }
        switchboardFunction = myFunction;
        attestationQueuePubkey = functionState.attestationQueue;
      } catch (error) {
        console.error(
          `$SWITCHBOARD_FUNCTION_PUBKEY in your .env file is incorrect, please fix`
        );
      }
    }

    if (!switchboardFunction || !attestationQueuePubkey) {
      if (!process.env.CONTAINER_NAME) {
        throw new Error(
          `You need to set CONTAINER_NAME in your .env file to create a new Switchboard Function. Example:\n\tCONTAINER_NAME=switchboardlabs/solana-vrf-flip`
        );
      }
      const genesisHash = await provider.connection.getGenesisHash();
      const attestationQueueAddress =
        genesisHash === MAINNET_GENESIS_HASH
          ? ""
          : genesisHash === DEVNET_GENESIS_HASH
          ? ""
          : undefined;
      if (!attestationQueueAddress) {
        throw new Error(
          `The request script currently only works on mainnet-beta or devnet (if SWITCHBOARD_FUNCTION_PUBKEY is not set in your .env file))`
        );
      }
      console.log(`Initializing new SwitchboardFunction ...`);
      const attestationQueue = new AttestationQueueAccount(
        switchboardProgram,
        attestationQueueAddress
      );
      await attestationQueue.loadData();
      const [functionAccount, functionInitTx] = await FunctionAccount.create(
        switchboardProgram,
        {
          name: "VRF-FLIP",
          metadata:
            "https://github.com/switchboard-xyz/vrf-flip/tree/main/switchboard-function",
          container: process.env.CONTAINER_NAME,
          containerRegistry: "dockerhub",
          version: "latest",
          attestationQueue,
          authority: payer.publicKey,
          mrEnclave: MrEnclave,
        }
      );
      console.log(`[TX] function_init: ${functionInitTx}`);

      console.log(
        `\nMake sure to add the following to your .env file:\n\tSWITCHBOARD_FUNCTION_PUBKEY=${functionAccount.publicKey}\n\n`
      );

      switchboardFunction = functionAccount;
      attestationQueuePubkey = attestationQueue.publicKey;
    }

    const mintKeypair = anchor.web3.Keypair.generate();
    const houseVault = anchor.utils.token.associatedAddress({
      mint: mintKeypair.publicKey,
      owner: housePubkey,
    });
    const tx = await program.methods
      .houseInit({})
      .accounts({
        house: housePubkey,
        authority: payer.publicKey,
        switchboardFunction: switchboardFunction.publicKey,
        mint: mintKeypair.publicKey,
        houseVault: houseVault,
        payer: payer.publicKey,
      })
      .signers([mintKeypair])
      .rpc();
    console.log(`[TX] house_init: ${tx}`);

    flipMintPubkey = mintKeypair.publicKey;
    houseVaultPubkey = houseVault;
  }

  const [userPubkey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("USERSEEDV1"),
      housePubkey.toBytes(),
      payer.publicKey.toBytes(),
    ],
    program.programId
  );
  console.log(`USER: ${userPubkey}`);

  // check if user exists and get the request
  let switchboardRequest: FunctionRequestAccount;
  let switchboardRequestEscrowPubkey: PublicKey;
  let userEscrowPubkey: PublicKey;
  let userRewardAddressPubkey: PublicKey;
  try {
    const userState = await program.account.userState.fetch(userPubkey);
    console.log(`USER already initialized`);
    console.log(`REQUEST: ${userState.switchboardRequest}`);

    switchboardRequest = new FunctionRequestAccount(
      switchboardProgram,
      userState.switchboardRequest
    );
    const requestState = await switchboardRequest.loadData();
    switchboardRequestEscrowPubkey = requestState.escrow;
    userEscrowPubkey = userState.escrow;
    userRewardAddressPubkey = userState.rewardAddress;
  } catch (error) {
    if (!`${error}`.includes("Account does not exist or has no data")) {
      throw error;
    }

    const escrowKeypair = anchor.web3.Keypair.generate();
    const switchboardRequestKeypair = anchor.web3.Keypair.generate();
    const switchboardRequestEscrow = anchor.utils.token.associatedAddress({
      mint: switchboardProgram.mint.address,
      owner: switchboardRequestKeypair.publicKey,
    });
    const rewardAddress = anchor.utils.token.associatedAddress({
      mint: flipMintPubkey,
      owner: payer.publicKey,
    });

    const tx = await program.methods
      .userInit({})
      .accounts({
        user: userPubkey,
        house: housePubkey,
        mint: flipMintPubkey,
        authority: payer.publicKey,
        escrow: escrowKeypair.publicKey,
        rewardAddress,
        switchboardFunction: switchboardFunction.publicKey,
        switchboardMint: switchboardProgram.mint.address,
        switchboardRequest: switchboardRequestKeypair.publicKey,
        switchboardRequestEscrow,
        switchboardState: switchboardProgram.attestationProgramState.publicKey,
        switchboardAttestationQueue: attestationQueuePubkey,
        switchboard: switchboardProgram.attestationProgramId,
        payer: payer.publicKey,
      })
      .signers([escrowKeypair, switchboardRequestKeypair])
      .rpc();
    console.log(`[TX] user_init: ${tx}`);

    switchboardRequest = new FunctionRequestAccount(
      switchboardProgram,
      switchboardRequestKeypair.publicKey
    );
    switchboardRequestEscrowPubkey = switchboardRequestEscrow;
    userEscrowPubkey = escrowKeypair.publicKey;
    userRewardAddressPubkey = rewardAddress;
  }

  const currentSlot = await provider.connection.getSlot();

  // NOW LETS TRIGGER THE REQUEST
  const requestStartTime = Date.now();
  const tx = await program.methods
    .userBet({
      gameType: 1, // CoinFlip
      userGuess: 1,
      betAmount: new anchor.BN(1),
    })
    .accounts({
      user: userPubkey,
      house: housePubkey,
      houseVault: houseVaultPubkey,
      authority: payer.publicKey,
      escrow: userEscrowPubkey,
      switchboardMint: switchboardProgram.mint.address,
      switchboardFunction: switchboardFunction.publicKey,
      switchboardRequest: switchboardRequest.publicKey,
      switchboardRequestEscrow: switchboardRequestEscrowPubkey,
      switchboardState: switchboardProgram.attestationProgramState.publicKey,
      switchboardAttestationQueue: attestationQueuePubkey,
      switchboard: switchboardProgram.attestationProgramId,
      payer: payer.publicKey,
      flipPayer: userRewardAddressPubkey,
    })
    .rpc();
  const requestPostTxnTime = Date.now();
  let requestSettleTime = requestPostTxnTime;
  console.log(`[TX] user_bet: ${tx}\n`);

  let userState = await program.account.userState.fetch(
    userPubkey,
    "processed"
  );
  let totalWaitTime = 0;
  while (totalWaitTime < 45_000) {
    const start = Date.now();
    userState = await program.account.userState.fetch(userPubkey, "processed");
    if (
      userState.currentRound.requestSlot.toNumber() >= currentSlot &&
      userState.currentRound.status.settled
    ) {
      requestSettleTime = Date.now();
      totalWaitTime += Date.now() - start;
      break;
    } else {
      // small delay
      await sleep(100);
      totalWaitTime += Date.now() - start;
      if (totalWaitTime >= 45_000) {
        throw new Error(`Timed out waiting for request to settle!`);
      }
    }
  }

  if (userState.currentRound.guess === userState.currentRound.result) {
    console.log(`You won!`);
  } else {
    console.log(`Sorry, you lost!`);
  }

  console.log(`\n### METRICS`);
  console.log(
    `start:   ${((requestStartTime - requestStartTime) / 1000).toFixed(3)}`
  );
  console.log(
    `postTx:  ${((requestPostTxnTime - requestStartTime) / 1000).toFixed(3)}`
  );
  console.log(
    `settled: ${((requestSettleTime - requestStartTime) / 1000).toFixed(3)}`
  );

  const fullDuration = (requestSettleTime - requestStartTime) / 1000;
  const confirmDuration = (requestSettleTime - requestPostTxnTime) / 1000;
  console.log(`Full Roundtrip: ${fullDuration.toFixed(3)}`);
  console.log(`Settle Request: ${confirmDuration.toFixed(3)}`);
})();
