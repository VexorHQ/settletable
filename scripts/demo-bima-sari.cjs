// Demo alur bayar end-to-end Bima x Sari di jaringan Hardhat in-process.
// Dijalankan: npm run demo
//
//   Sari terbitkan terms (0,50 USDC) -> Bima tawar 0,40 -> Sari balas 0,45
//   -> Bima terima -> mandate 0,45 ditandatangani Bima -> settle lewat
//   transferWithAuthorization -> receipt tercatat + receiptText dicetak.
//   Lalu satu bayar 0,60 di atas cap DITOLAK di tiga lapis (negosiasi,
//   mandate, settle) — saldo tidak berubah, receipt tetap 1.
//
// File ini .cjs dengan sengaja (lihat scripts/test-contracts.cjs): require()
// modul .ts di src/server lewat hook ts-node Hardhat.
//
// Kunci di bawah adalah kunci test Hardhat yang sudah publik — hanya untuk
// jaringan lokal, tidak pernah dipakai di testnet/mainnet.

const hre = require("hardhat");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  keccak256,
  toHex,
} = require("viem");
const { mnemonicToAccount } = require("viem/accounts");
const { cartForService, listServices } = require("../src/server/terms");
const { acceptOffer, agreedTerms, offerPrice, startNegotiation } = require("../src/server/negotiate");
const { buildCartMandate, createMandate } = require("../src/server/mandates");
const { executeSettle, signTransferAuthorization } = require("../src/server/settle");
const { readReceipt } = require("../src/server/receipts");
const { DEMO_CAPS, SelesaiStore } = require("../src/server/store");
const { signCartMandate, usdc } = require("../src/lib/mandate");

const hardhatChain = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function loadArtifact(name) {
  const raw = fs.readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8");
  const parsed = JSON.parse(raw);
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function main() {
  const deployer = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
  const bima = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });
  const sari = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 });
  const store = new SelesaiStore();

  const publicClient = createPublicClient({ chain: hardhatChain, transport: custom(hre.network.provider) });
  const wallet = createWalletClient({ chain: hardhatChain, transport: custom(hre.network.provider) });

  const mock = loadArtifact("MockUSDC");
  const registry = loadArtifact("ReceiptRegistry");

  console.log("== Deploy lokal (Hardhat in-process) ==");
  const mockHash = await wallet.deployContract({ abi: mock.abi, bytecode: mock.bytecode, account: deployer, args: [] });
  const mockReceipt = await publicClient.waitForTransactionReceipt({ hash: mockHash });
  const mockAddress = mockReceipt.contractAddress;
  console.log(`  MockUSDC di ${mockAddress}`);

  const registryHash = await wallet.deployContract({ abi: registry.abi, bytecode: registry.bytecode, account: deployer, args: [] });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress;
  console.log(`  ReceiptRegistry di ${registryAddress}`);

  await wallet.writeContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "mint",
    account: deployer,
    args: [bima.address, usdc("10")],
  });
  console.log("  Bima dibekali 10 USDC (mock)");

  // 1. Terms — Sari menerbitkan katalog.
  const service = listServices()[0];
  console.log(`\n== 1. Terms: Sari jual "${service.title}" — harga katalog 0,50 USDC ==`);

  // 2. Negosiasi — Bima tawar 0,40, Sari balas 0,45, Bima terima.
  const neg = startNegotiation({
    serviceId: service.serviceId,
    seller: sari.address,
    buyer: bima.address,
    listPrice: service.listPrice,
  });
  store.negotiations.set(neg.id, neg);
  console.log("== 2. Negosiasi ==");
  console.log(`  Bima tawar 0,40 -> ${offerPrice(neg, "buyer", usdc("0.40"), store.caps).ok ? "diterima" : "ditolak"}`);
  console.log(`  Sari balas 0,45 -> ${offerPrice(neg, "seller", usdc("0.45"), store.caps).ok ? "diterima" : "ditolak"}`);
  console.log(`  Bima terima    -> ${acceptOffer(neg, "buyer").ok ? "disepakati" : "gagal"}`);
  assert.equal(agreedTerms(neg).price, usdc("0.45"));
  console.log("  Harga akhir: 0,45 USDC");

  // 3. Mandate — Bima menandatangani Cart Mandate 0,45.
  console.log("== 3. Mandate: Bima tanda tangani Cart Mandate 0,45 USDC ==");
  const created = await createMandate({
    negotiation: neg,
    cart: cartForService(service, usdc("0.45")),
    payerAccount: bima,
    chainId: 31337,
    tokenAddress: mockAddress,
    chain: "hardhat",
    token: "USDC",
    caps: store.caps,
    nonce: "202611250101",
    store: store.mandates,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("mandate gagal dibuat");
  const { mandate, signature } = created.issued;
  console.log(`  mandate hash: ${created.issued.mandateHash}`);

  // 4. Settle — Bima menandatangani otorisasi EIP-3009, executor mengeksekusi.
  console.log("== 4. Settle: transferWithAuthorization 0,45 USDC ke Sari ==");
  const paymentId = keccak256(toHex("bima-bayar-sari-001"));
  const memo = "Ringkasan riset 5 sumber — 1 item";
  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const auth = await signTransferAuthorization(bima, "Mock USDC", 31337, mockAddress, {
    from: bima.address,
    to: sari.address,
    value: usdc("0.45"),
    validAfter: BigInt(now),
    validBefore: BigInt(now + 3600),
    nonce: paymentId,
  });
  const settled = await executeSettle(
    {
      publicClient,
      walletClient: wallet,
      executor: deployer,
      chain: hardhatChain,
      tokenAddress: mockAddress,
      registryAddress,
      chainId: 31337,
      ledger: store.ledger,
      store: store.mandates,
      caps: store.caps,
    },
    { mandate, signature, payer: bima.address, auth, paymentId, memo },
  );
  assert.equal(settled.ok, true);
  if (!settled.ok) throw new Error(`settle gagal: ${settled.reason}`);
  console.log(`  tx transfer: ${settled.txHash}`);
  console.log(`  tx receipt : ${settled.receiptTxHash}`);

  // 5. Receipt — saldo berpindah, receipt tercatat dan terbaca.
  const sariBalance = await publicClient.readContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "balanceOf",
    args: [sari.address],
  });
  const bimaBalance = await publicClient.readContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "balanceOf",
    args: [bima.address],
  });
  assert.equal(sariBalance, usdc("0.45"));
  assert.equal(bimaBalance, usdc("9.55"));
  console.log("  Saldo Sari: 0,45 USDC | Saldo Bima: 9,55 USDC — sesuai");

  const { receipt, text } = await readReceipt(publicClient, registryAddress, paymentId);
  assert.equal(receipt.amount, usdc("0.45"));
  assert.equal(receipt.memo, memo);
  console.log("\n== 5. Receipt (receiptText dari kontrak) ==");
  console.log(text);

  // 6. Guardrail — bayar 0,60 di atas cap 0,50 ditolak di tiga lapis.
  console.log("\n== 6. Guardrail: bayar 0,60 (cap 0,50/transaksi) ==");
  const neg60 = startNegotiation({
    serviceId: service.serviceId,
    seller: sari.address,
    buyer: bima.address,
    listPrice: service.listPrice,
  });
  const offer60 = offerPrice(neg60, "buyer", usdc("0.60"), store.caps);
  assert.equal(offer60.ok, false);
  console.log(`  Lapis negosiasi ditolak: ${offer60.reason}`);

  // Mandate 0,60 dibuat langsung (bypass negosiasi) untuk menguji lapis settle.
  neg60.status = "agreed";
  neg60.agreedPrice = usdc("0.60");
  const mandate60 = buildCartMandate({
    negotiation: neg60,
    cart: cartForService(service, usdc("0.60")),
    chain: "hardhat",
    token: "USDC",
    nonce: "202611250102",
  });
  const signature60 = await signCartMandate(bima, 31337, mockAddress, mandate60);
  const paymentId60 = keccak256(toHex("bima-bayar-sari-002"));
  const auth60 = await signTransferAuthorization(bima, "Mock USDC", 31337, mockAddress, {
    from: bima.address,
    to: sari.address,
    value: usdc("0.60"),
    validAfter: BigInt(now),
    validBefore: BigInt(now + 3600),
    nonce: paymentId60,
  });
  const settled60 = await executeSettle(
    {
      publicClient,
      walletClient: wallet,
      executor: deployer,
      chain: hardhatChain,
      tokenAddress: mockAddress,
      registryAddress,
      chainId: 31337,
      ledger: store.ledger,
      store: store.mandates,
      caps: store.caps,
    },
    { mandate: mandate60, signature: signature60, payer: bima.address, auth: auth60, paymentId: paymentId60, memo },
  );
  assert.equal(settled60.ok, false);
  console.log(`  Lapis settle ditolak: ${settled60.reason}`);

  // Uang tidak bergerak, receipt tetap 1.
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "balanceOf", args: [sari.address] }),
    usdc("0.45"),
  );
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "balanceOf", args: [bima.address] }),
    usdc("9.55"),
  );
  assert.equal(
    await publicClient.readContract({ abi: registry.abi, address: registryAddress, functionName: "receiptCount", args: [] }),
    1n,
  );
  console.log("  Saldo tidak berubah, receipt tetap 1 — penolakan terjadi SEBELUM uang bergerak");

  console.log("\nDemo selesai: 1 bayar berhasil (0,45) + 1 bayar di atas cap ditolak (0,60).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
