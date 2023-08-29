#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */

/**
 * This script will
 *  - Build any anchor projects if missing
 *  - Grab anchor project IDs
 *  - Update project IDs in Anchor.toml and lib.rs
 */

const shell = require("shelljs");
const { spawn, execSync } = require("child_process");
const web3 = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const targetDir = path.join(projectRoot, "target");
const idlDir = path.join(targetDir, "idl");
const anchorToml = path.join(projectRoot, "Anchor.toml");

const shx = path.join(projectRoot, "node_modules", ".bin", "shx");

const switchboardVrfKeypairPath = path.join(
  targetDir,
  "deploy",
  "switchboard_vrf_flip-keypair.json"
);

/**
 * Fetch a list of filepaths for a given directory and desired file extension
 * @param [dirPath] Filesystem path to a directory to search.
 * @param [arrayOfFiles] An array of existing file paths for recursive calls
 * @param [extensions] Optional, an array of desired extensions with the leading separator '.'
 * @throws {String}
 * @returns {string[]}
 */
const getAllFiles = (dirPath, arrayOfFiles, extensions) => {
  const files = fs.readdirSync(dirPath, "utf8");

  arrayOfFiles = arrayOfFiles || [];

  files.forEach((file) => {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(
        dirPath + "/" + file,
        arrayOfFiles,
        extensions
      );
    } else {
      const ext = path.extname(file);
      if (extensions && Array.isArray(extensions) && extensions.includes(ext)) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      } else {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
      // if (!(extensions === undefined) || extensions.includes(ext)) {
      //   arrayOfFiles.push(path.join(dirPath, '/', file));
      // }
    }
  });

  return arrayOfFiles;
};

async function main() {
  shell.cd(projectRoot);

  if (!shell.which("solana")) {
    shell.echo(
      "Sorry, this script requires 'solana' to be installed in your $PATH"
    );
    shell.exit(1);
  }

  if (!shell.which("anchor")) {
    shell.echo(
      "Sorry, this script requires 'anchor' to be installed in your $PATH"
    );
    shell.exit(1);
  }

  if (!fs.existsSync(path.join(targetDir, "deploy"))) {
    shell.echo("Missing program deploy keypairs, building projects");
    const anchorBuildSpawn = spawn("anchor", ["build"]);
    anchorBuildSpawn.stdout.on("data", function (msg) {
      console.log(msg.toString());
    });
    await new Promise((resolve) => {
      anchorBuildSpawn.on("close", resolve);
    });
  }

  const switchboardVrfFlipPid = web3.Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(switchboardVrfKeypairPath, "utf8"))
    )
  ).publicKey;

  // REPLACE PROGRAM IDS
  console.log(`Program ID:    ${switchboardVrfFlipPid}`);
  shell.sed(
    "-i",
    /declare_id!(.*);/,
    `declare_id!("${switchboardVrfFlipPid.toString()}");`,
    path.join(projectRoot, "src", "lib.rs")
  );
  shell.sed(
    "-i",
    /switchboard_vrf_flip = "(.*)"/,
    `switchboard_vrf_flip = "${switchboardVrfFlipPid.toString()}"`,
    anchorToml
  );

  // Build Anchor APIs
  const vrfClientPath = path.join(projectRoot, "client", "generated");

  shell.rm("-rf", vrfClientPath);
  fs.mkdirSync(vrfClientPath, { recursive: true });
  execSync(
    `npx anchor-client-gen ${path.join(
      idlDir,
      "switchboard_vrf_flip.json"
    )} ${vrfClientPath} --program-id ${switchboardVrfFlipPid.toString()}`
  );

  // loop through directory and run regex replaces
  for await (const file of [
    ...getAllFiles("./client/generated/accounts"),
    ...getAllFiles("./client/generated/errors"),
    ...getAllFiles("./client/generated/instructions"),
    ...getAllFiles("./client/generated/types"),
  ]) {
    if (file.includes("index.ts")) {
      continue;
    }
    const fileString = fs.readFileSync(file, "utf-8");
    fs.writeFileSync(
      file,
      `import { FlipProgram } from "../../program"\n${fileString}`
    );

    console.log(file);
    // replace BN import
    // execSync(
    //   `sed -i '' 's/import BN from \\"bn.js\\"/import { BN } from \\"@switchboard-xyz\\/common\\"/g' ${file}`
    // );
    // replace borsh import
    execSync(`sed -i '' 's/@project-serum/@coral-xyz/g' ${file}`);
    // remove PROGRAM_ID import, we will use FlipProgram instead
    execSync(
      `sed -i '' 's/import { PROGRAM_ID } from "..\\/programId"/ /g' ${file}`
    );
    // replace PROGRAM_ID with program.programId
    execSync(`sed -i '' 's/PROGRAM_ID/program.programId/g' ${file}`);
    // replace Connection with FlipProgram
    execSync(
      `sed -i '' 's/c: Connection,/program: {connection: Connection;programId:PublicKey;},/g' ${file}`
    );
    // replace c.getAccountInfo with the FlipProgram connection
    execSync(
      `sed -i '' 's/c.getAccountInfo/program.connection.getAccountInfo/g' ${file}`
    );
    // replace c.getMultipleAccountsInfo with the FlipProgram connection
    execSync(
      `sed -i '' 's/c.getMultipleAccountsInfo/program.connection.getMultipleAccountsInfo/g' ${file}`
    );

    // add program as first arguement to instructions
    if (file.includes("/instructions/")) {
      execSync(
        `sed -i '' 's/args:/program: {programId:PublicKey;}, args:/g' ${file}`
      );
    }
  }

  execSync("npx prettier ./client/generated --write");
}

main()
  .then(() => {
    // console.log("Executed successfully");
  })
  .catch((err) => {
    console.error(err);
  });
