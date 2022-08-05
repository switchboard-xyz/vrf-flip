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

const anchorClientGen = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  "anchor-client-gen"
);
const shx = path.join(projectRoot, "node_modules", ".bin", "shx");

const switchboardVrfKeypairPath = path.join(
  targetDir,
  "deploy",
  "switchboard_vrf_flip-keypair.json"
);

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
    path.join(projectRoot, "programs", "vrf-flip", "src", "lib.rs")
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
    `node ${anchorClientGen} ${path.join(
      idlDir,
      "switchboard_vrf_flip.json"
    )} ${vrfClientPath} --program-id ${switchboardVrfFlipPid.toString()}`
  );
}

main()
  .then(() => {
    // console.log("Executed successfully");
  })
  .catch((err) => {
    console.error(err);
  });
