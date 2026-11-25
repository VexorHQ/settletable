// Deploy ke HSK Chain mainnet (chain 177) — PLACEHOLDER, JANGAN DIJALANKAN
// sebelum keputusan Junes soal anggaran mainnet (PLAN.md §11.2).
//
// Dijalankan (nanti, 1 Des): SETTLETABLE_MAINNET_CONFIRMED=yes npm run deploy:mainnet
// Tanpa variabel itu, skrip ini HANYA mencetak rencana dan berhenti —
// tidak ada transaksi yang dikirim, tidak ada yang di-deploy.
//
// Aturan mainnet (PLAN.md §4):
//  - HANYA ReceiptRegistry yang di-deploy ke mainnet (murah, tidak pegang dana).
//  - MockUSDC TIDAK PERNAH di-deploy ke mainnet — di mainnet pakai USDC HSP.
//  - Pembayaran demo mainnet maksimal 0,10 USDC.

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicClient, createWalletClient, defineChain, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const HSK_MAINNET = defineChain({
  id: 177,
  name: "HSKChain",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [process.env.HSK_MAINNET_RPC || "https://mainnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://hsk.blockscout.com" } },
});

function loadArtifact(name) {
  const raw = fs.readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8");
  const parsed = JSON.parse(raw);
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function main() {
  if (process.env.SETTLETABLE_MAINNET_CONFIRMED !== "yes") {
    console.log("=== DEPLOY MAINNET — DITAHAN ===");
    console.log("Skrip ini tidak melakukan apa-apa tanpa SETTLETABLE_MAINNET_CONFIRMED=yes.");
    console.log("");
    console.log("Yang akan terjadi bila dikonfirmasi (1 Des, setelah yes Junes):");
    console.log("  1. Deploy ReceiptRegistry SAJA ke HSK mainnet (chain 177).");
    console.log("  2. MockUSDC TIDAK di-deploy ke mainnet — token mainnet = USDC HSP");
    console.log("     0x84fA0c5a2E8CEb4C5BfA8E9fB5F2aA93f3fA6a39 (RESEARCH.md §3).");
    console.log("  3. Alamat tercatat di deployments/mainnet-177.json.");
    console.log("");
    console.log("Yang dibutuhkan sebelum konfirmasi:");
    console.log("  - Keputusan Junes: anggaran beli HSK + USDC mainnet (PLAN.md §11.2).");
    console.log("  - DEPLOYER_PRIVATE_KEY (wallet Junes) + saldo HSK cukup untuk gas.");
    console.log("  - Verifikasi: proyek tanpa deploy mainnet kehilangan eligibility");
    console.log("    demo selection (halaman DoraHacks) — jadi ini bukan opsional");
    console.log("    bila mau menang, tapi tetap butuh yes eksplisit Junes.");
    return;
  }

  if (hre.network.name !== "hskMainnet") {
    throw new Error(`deploy mainnet hanya lewat --network hskMainnet (sekarang: ${hre.network.name})`);
  }
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY belum diisi.");
  const deployer = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: HSK_MAINNET, transport: http() });
  const wallet = createWalletClient({ chain: HSK_MAINNET, transport: http(), account: deployer });

  const chainId = await publicClient.getChainId();
  if (chainId !== 177) throw new Error(`chainId RPC bukan 177 (dapat ${chainId})`);

  const balance = await publicClient.getBalance({ address: deployer.address });
  console.log(`Deployer: ${deployer.address} — saldo HSK: ${balance} wei`);
  if (balance === 0n) throw new Error("saldo HSK 0 — isi dulu sebelum deploy mainnet.");

  const registry = loadArtifact("ReceiptRegistry");
  console.log("Deploy ReceiptRegistry (mainnet)...");
  const hash = await wallet.deployContract({ abi: registry.abi, bytecode: registry.bytecode, account: deployer, args: [] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  console.log(`  ReceiptRegistry: ${address}`);
  console.log(`  https://hsk.blockscout.com/address/${address}`);

  const out = {
    chainId: 177,
    network: "hskMainnet",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    receiptRegistry: { address, txHash: hash, blockNumber: Number(receipt.blockNumber) },
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(path.join("deployments", "mainnet-177.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("\nAlamat tersimpan di deployments/mainnet-177.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
