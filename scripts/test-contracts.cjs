// Tes kontrak di jaringan Hardhat in-process (bukan testnet).
// Dijalankan: npm run test:contracts
//
// File ini .cjs (CommonJS) dengan sengaja: Hardhat 2.22 memuat skrip .ts
// sebagai ESM native (type-stripping Node) sehingga import file .ts lain
// tidak ter-resolve; sebagai CJS, require() melewati hook ts-node Hardhat
// dan src/lib/mandate.ts bisa dipakai langsung.
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
  decodeEventLog,
  defineChain,
  getAddress,
  keccak256,
  parseSignature,
  toHex,
} = require("viem");
const { mnemonicToAccount } = require("viem/accounts");
const { SpendLedger, cartHash, cartMandateHash, signCartMandate, usdc, verifyCartMandate } = require("../src/lib/mandate");

const hardhatChain = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

// Akun test Hardhat — diturunkan dari mnemonic test yang sudah publik
// ("test ... junk", jalur m/44'/60'/0'/0/N), bukan dari kunci yang diketik
// manual (rawan salah satu karakter). Hanya untuk jaringan lokal.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function loadArtifact(name) {
  const raw = fs.readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8");
  const parsed = JSON.parse(raw);
  return { abi: parsed.abi, bytecode: parsed.bytecode };
}

async function expectRevert(promise, label) {
  try {
    await promise;
  } catch {
    console.log(`  ok — ${label} ditolak`);
    return;
  }
  throw new Error(`seharusnya revert: ${label}`);
}

async function main() {
  const deployer = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
  const bima = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });
  const sari = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 });

  const publicClient = createPublicClient({ chain: hardhatChain, transport: custom(hre.network.provider) });
  const wallet = createWalletClient({ chain: hardhatChain, transport: custom(hre.network.provider) });

  const mock = loadArtifact("MockUSDC");
  const registry = loadArtifact("ReceiptRegistry");

  console.log("== MockUSDC: deploy + EIP-3009 ==");
  const mockDeployHash = await wallet.deployContract({
    abi: mock.abi,
    bytecode: mock.bytecode,
    account: deployer,
    args: [],
  });
  const mockReceipt = await publicClient.waitForTransactionReceipt({ hash: mockDeployHash });
  const mockAddress = mockReceipt.contractAddress;
  console.log(`  MockUSDC di ${mockAddress}`);

  // Deployer mencetak 10 USDC untuk Bima.
  await wallet.writeContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "mint",
    account: deployer,
    args: [bima.address, usdc("10")],
  });
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "balanceOf", args: [bima.address] }),
    usdc("10"),
  );

  // Bima menandatangani Cart Mandate 0,45 USDC untuk Sari (alurnya seperti di API nanti).
  const cart = [{ item_id: "riset-5-sumber", name: "Ringkasan riset 5 sumber", price: "0.45", quantity: 1 }];
  const mandate = {
    chain: "hardhat",
    token: "USDC",
    payment_amount: usdc("0.45").toString(),
    payment_amount_usd: "0.45",
    payee: sari.address,
    nonce: "202611250001",
    expiry: new Date(Date.now() + 3600_000).toISOString(),
    cart_hash: cartHash(cart),
  };
  const mandateSignature = await signCartMandate(bima, 31337, mockAddress, mandate);
  assert.equal(await verifyCartMandate(31337, mockAddress, mandate, mandateSignature, bima.address), true);
  const mandateHash = cartMandateHash(31337, mockAddress, mandate);

  // Guardrail cap: 0,45 lolos (cap 0,50/transaksi, 5,00/hari).
  const ledger = new SpendLedger();
  assert.deepEqual(
    ledger.record(bima.address, usdc("0.45"), mandate.nonce, { perTxCap: usdc("0.50"), dailyCap: usdc("5.00") }),
    { ok: true },
  );

  // Bima menandatangani otorisasi EIP-3009 untuk 0,45 USDC.
  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const authNonce = keccak256(toHex("auth-bima-001"));
  const authTypes = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };
  const authDomain = { name: "Mock USDC", version: "1", chainId: 31337, verifyingContract: mockAddress };
  const authMessage = {
    from: bima.address,
    to: sari.address,
    value: usdc("0.45"),
    validAfter: BigInt(now),
    validBefore: BigInt(now + 3600),
    nonce: authNonce,
  };
  const authSignature = await bima.signTypedData({
    domain: authDomain,
    types: authTypes,
    primaryType: "TransferWithAuthorization",
    message: authMessage,
  });
  const { v, r, s } = parseSignature(authSignature);

  // Siapa saja boleh mengeksekusi otorisasi — di sini deployer yang mengirim.
  const transferHash = await wallet.writeContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "transferWithAuthorization",
    account: deployer,
    args: [authMessage.from, authMessage.to, authMessage.value, authMessage.validAfter, authMessage.validBefore, authMessage.nonce, Number(v), r, s],
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
  assert.equal(transferReceipt.status, "success");
  const authEvent = decodeEventLog({ abi: mock.abi, data: transferReceipt.logs[0].data, topics: transferReceipt.logs[0].topics });
  assert.equal(authEvent.eventName, "AuthorizationUsed");
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "balanceOf", args: [sari.address] }),
    usdc("0.45"),
  );
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "balanceOf", args: [bima.address] }),
    usdc("9.55"),
  );
  console.log("  ok — transferWithAuthorization 0,45 USDC, saldo berpindah");

  // Nonce yang sama tidak bisa dipakai dua kali.
  await expectRevert(
    wallet.writeContract({
      abi: mock.abi,
      address: mockAddress,
      functionName: "transferWithAuthorization",
      account: deployer,
      args: [authMessage.from, authMessage.to, authMessage.value, authMessage.validAfter, authMessage.validBefore, authMessage.nonce, Number(v), r, s],
    }),
    "otorisasi dengan nonce yang sudah dipakai",
  );

  // CancelAuthorization: Bima membatalkan nonce lain, lalu otorisasi itu mati.
  const cancelNonce = keccak256(toHex("auth-bima-002"));
  const cancelTypes = {
    CancelAuthorization: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
  };
  const cancelSignature = await bima.signTypedData({
    domain: authDomain,
    types: cancelTypes,
    primaryType: "CancelAuthorization",
    message: { authorizer: bima.address, nonce: cancelNonce },
  });
  const cancelSig = parseSignature(cancelSignature);
  await wallet.writeContract({
    abi: mock.abi,
    address: mockAddress,
    functionName: "cancelAuthorization",
    account: deployer,
    args: [bima.address, cancelNonce, Number(cancelSig.v), cancelSig.r, cancelSig.s],
  });
  assert.equal(
    await publicClient.readContract({ abi: mock.abi, address: mockAddress, functionName: "authorizationState", args: [bima.address, cancelNonce] }),
    true,
  );
  console.log("  ok — cancelAuthorization menandai nonce sebagai terpakai");

  console.log("== ReceiptRegistry: catat + baca receipt ==");
  const registryDeployHash = await wallet.deployContract({
    abi: registry.abi,
    bytecode: registry.bytecode,
    account: deployer,
    args: [],
  });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryDeployHash });
  const registryAddress = registryReceipt.contractAddress;
  console.log(`  ReceiptRegistry di ${registryAddress}`);

  const paymentId = keccak256(toHex("bima-bayar-sari-001"));
  const memo = "Ringkasan riset 5 sumber — 1 item";
  await wallet.writeContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "recordReceipt",
    account: deployer,
    args: [paymentId, bima.address, sari.address, mockAddress, usdc("0.45"), mandateHash, transferHash, memo],
  });

  const stored = await publicClient.readContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "getReceipt",
    args: [paymentId],
  });
  assert.equal(stored.payer, bima.address);
  assert.equal(stored.payee, sari.address);
  // Alamat dari receipt kontrak lowercase; samakan dulu ke checksummed.
  assert.equal(getAddress(stored.token), getAddress(mockAddress));
  assert.equal(stored.amount, usdc("0.45"));
  assert.equal(stored.mandateHash, mandateHash);
  assert.equal(stored.txHash, transferHash);
  assert.equal(stored.memo, memo);
  assert.equal(await publicClient.readContract({ abi: registry.abi, address: registryAddress, functionName: "receiptCount", args: [] }), 1n);
  console.log("  ok — receipt tercatat dan terbaca kembali utuh");

  const byPayer = await publicClient.readContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "receiptsOfPayer",
    args: [bima.address],
  });
  assert.equal(byPayer.length, 1);
  const byPayee = await publicClient.readContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "receiptsOfPayee",
    args: [sari.address],
  });
  assert.equal(byPayee.length, 1);
  const byIndex = await publicClient.readContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "receiptByIndex",
    args: [0n],
  });
  assert.equal(byIndex.paymentId, paymentId);
  console.log("  ok — lookup per payer/payee/index jalan");

  const text = await publicClient.readContract({
    abi: registry.abi,
    address: registryAddress,
    functionName: "receiptText",
    args: [paymentId],
  });
  assert.ok(text.startsWith("SELESAI RECEIPT"));
  assert.ok(text.includes(memo));
  assert.ok(text.includes(bima.address.toLowerCase()));
  console.log("  ok — receiptText terbaca seperti dokumen tagihan");

  await expectRevert(
    wallet.writeContract({
      abi: registry.abi,
      address: registryAddress,
      functionName: "recordReceipt",
      account: deployer,
      args: [paymentId, bima.address, sari.address, mockAddress, usdc("0.45"), mandateHash, transferHash, memo],
    }),
    "receipt ganda dengan paymentId yang sama",
  );
  await expectRevert(
    wallet.writeContract({
      abi: registry.abi,
      address: registryAddress,
      functionName: "recordReceipt",
      account: deployer,
      args: [keccak256(toHex("lain")), bima.address, sari.address, mockAddress, 0n, mandateHash, transferHash, memo],
    }),
    "receipt dengan jumlah nol",
  );

  console.log("\nSemua tes kontrak lolos.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
