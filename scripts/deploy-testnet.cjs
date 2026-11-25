// Deploy ke HSK Chain testnet (chain 133).
// Dijalankan: npm run deploy:testnet
// Butuh DEPLOYER_PRIVATE_KEY di environment (isi dari .env, JANGAN commit).
// HANYA deploy ke testnet — skrip ini menolak jalan di jaringan lain.
//
// Belum dijalankan: butuh tHSK dari faucet + kunci deployer (wallet Junes).
// Setelah jalan, alamat tercatat di deployments/testnet-133.json — isi juga
// ke .env (RECEIPT_REGISTRY_TESTNET, PAYMENT_TOKEN_ADDRESS_TESTNET bila
// MockUSDC yang dipakai; bila USDC HSP, alamatnya sudah di RESEARCH.md §3).

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicClient, createWalletClient, defineChain, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const HSK_TESTNET = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [process.env.HSK_TESTNET_RPC || "https://testnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://testnet-explorer.hskchain.net" } },
});

function loadArtifact(name) {
  const raw = fs.readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8");
  const parsed = JSON.parse(raw);
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function main() {
  if (hre.network.name !== "hskTestnet") {
    throw new Error(`skrip ini hanya untuk --network hskTestnet (sekarang: ${hre.network.name})`);
  }
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    throw new Error("DEPLOYER_PRIVATE_KEY belum diisi. Export dari .env dulu, lalu jalankan lagi.");
  }
  const deployer = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: HSK_TESTNET, transport: http() });
  const wallet = createWalletClient({ chain: HSK_TESTNET, transport: http(), account: deployer });

  const chainId = await publicClient.getChainId();
  if (chainId !== 133) throw new Error(`chainId RPC bukan 133 (dapat ${chainId})`);

  const balance = await publicClient.getBalance({ address: deployer.address });
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Saldo tHSK: ${balance} wei`);
  if (balance === 0n) {
    throw new Error("saldo tHSK 0 — klaim dulu dari faucet https://faucet.hashkeychain.com");
  }

  const mock = loadArtifact("MockUSDC");
  const registry = loadArtifact("ReceiptRegistry");

  console.log("Deploy MockUSDC...");
  const mockHash = await wallet.deployContract({ abi: mock.abi, bytecode: mock.bytecode, account: deployer, args: [] });
  const mockReceipt = await publicClient.waitForTransactionReceipt({ hash: mockHash });
  const mockAddress = mockReceipt.contractAddress;
  console.log(`  MockUSDC: ${mockAddress}`);
  console.log(`  https://testnet-explorer.hskchain.net/address/${mockAddress}`);

  console.log("Deploy ReceiptRegistry...");
  const registryHash = await wallet.deployContract({ abi: registry.abi, bytecode: registry.bytecode, account: deployer, args: [] });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress;
  console.log(`  ReceiptRegistry: ${registryAddress}`);
  console.log(`  https://testnet-explorer.hskchain.net/address/${registryAddress}`);

  const out = {
    chainId: 133,
    network: "hskTestnet",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    mockUSDC: { address: mockAddress, txHash: mockHash, blockNumber: Number(mockReceipt.blockNumber) },
    receiptRegistry: { address: registryAddress, txHash: registryHash, blockNumber: Number(registryReceipt.blockNumber) },
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(path.join("deployments", "testnet-133.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("\nAlamat tersimpan di deployments/testnet-133.json");
  console.log("Langkah berikut: isi RECEIPT_REGISTRY_TESTNET di .env, lalu verifikasi source di explorer.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
