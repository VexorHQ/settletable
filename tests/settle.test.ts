// Unit test settle — verifikasi mandate sebelum bayar + baca receipt.
// Tanpa chain: cek preflight (tanda tangan, kedaluwarsa, nonce, cap,
// cabut) dan pembacaan receipt lewat stub client. Eksekusi on-chain
// diuji skrip demo (scripts/demo-bima-sari.cjs) + test-contracts.cjs.

import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex, PublicClient } from "viem";
import { keccak256, toHex } from "viem";
import {
  cartMandateHash,
  signCartMandate,
  usdc,
  type CartMandate,
  type SpendCaps,
  SpendLedger,
} from "../src/lib/mandate";
import { buildCartMandate, createMandate, MandateStore, verifyMandateForSettle } from "../src/server/mandates";
import { cartForService, listServices } from "../src/server/terms";
import { acceptOffer, offerPrice, startNegotiation, type Negotiation } from "../src/server/negotiate";
import {
  authSignatureHex,
  recoverTransferAuthorizationSigner,
  signTransferAuthorization,
} from "../src/server/settle";
import { listReceiptsOfPayee, listReceiptsOfPayer, readReceipt, receiptCount } from "../src/server/receipts";

const HSK_TESTNET_CHAIN_ID = 133;
const USDC_HSP_TESTNET = "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6" as const;
const DEMO_CAPS: SpendCaps = { perTxCap: usdc("0.50"), dailyCap: usdc("5.00") };

const bima = privateKeyToAccount(generatePrivateKey());
const sari = privateKeyToAccount(generatePrivateKey());

function agreedNegotiation(price: string): Negotiation {
  const service = listServices()[0];
  const neg = startNegotiation({
    serviceId: service.serviceId,
    seller: sari.address,
    buyer: bima.address,
    listPrice: service.listPrice,
  });
  // Negosiasi langsung disepakati di harga yang diminta (untuk tes settle
  // saja — alur tawarnya diuji di negotiation.test.ts).
  neg.status = "agreed";
  neg.agreedPrice = usdc(price);
  return neg;
}

async function signedMandate(price: string, overrides: Partial<CartMandate> = {}) {
  const service = listServices()[0];
  const neg = agreedNegotiation(price);
  const mandate = buildCartMandate({
    negotiation: neg,
    cart: cartForService(service, usdc(price)),
    chain: "hashkey-testnet",
    token: "USDC",
    nonce: "202611250101",
    ...overrides,
  });
  const signature = await signCartMandate(bima, HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
  return { mandate, signature };
}

describe("verifyMandateForSettle — cek sebelum uang bergerak", () => {
  it("mandate 0,45 yang valid lolos semua cek", async () => {
    const { mandate, signature } = await signedMandate("0.45");
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result).toEqual({ ok: true });
  });

  it("mandate kedaluwarsa ditolak", async () => {
    const { mandate, signature } = await signedMandate("0.45", {
      expiry: new Date(Date.now() - 1000).toISOString(),
    });
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("kedaluwarsa");
  });

  it("mandate 0,60 ditolak di atas cap — sebelum uang bergerak", async () => {
    const { mandate, signature } = await signedMandate("0.60", { nonce: "202611250102" });
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cap per transaksi");
  });

  it("nonce yang sudah dipakai ditolak", async () => {
    const { mandate, signature } = await signedMandate("0.45");
    const ledger = new SpendLedger();
    ledger.record(bima.address, usdc("0.45"), mandate.nonce, DEMO_CAPS);
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger,
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("sudah dipakai");
  });

  it("tanda tangan dari Sari (bukan Bima) ditolak", async () => {
    const service = listServices()[0];
    const neg = agreedNegotiation("0.45");
    // Sari yang menandatangani — padahal pembelinya Bima.
    const mandate = buildCartMandate({
      negotiation: neg,
      cart: cartForService(service, usdc("0.45")),
      chain: "hashkey-testnet",
      token: "USDC",
      nonce: "202611250101",
    });
    const signature = await signCartMandate(sari, HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("tidak cocok");
  });

  it("mandate yang dicabut ditolak", async () => {
    const { mandate, signature } = await signedMandate("0.45");
    const store = new MandateStore();
    store.issue({ mandate, signature, mandateHash: cartMandateHash(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate), payer: bima.address });
    store.revoke(mandate.nonce);
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate,
      signature,
      expectedPayer: bima.address,
      store,
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("dicabut");
  });

  it("jumlah yang diubah setelah ditandatangani ditolak", async () => {
    const { mandate, signature } = await signedMandate("0.45");
    const changed = { ...mandate, payment_amount: usdc("0.50").toString() };
    const result = await verifyMandateForSettle({
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      mandate: changed,
      signature,
      expectedPayer: bima.address,
      store: new MandateStore(),
      ledger: new SpendLedger(),
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
  });

  it("createMandate menolak harga di atas cap (defense in depth)", async () => {
    const service = listServices()[0];
    const neg = agreedNegotiation("0.60");
    const result = await createMandate({
      negotiation: neg,
      cart: cartForService(service, usdc("0.60")),
      payerAccount: bima,
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      chain: "hashkey-testnet",
      token: "USDC",
      caps: DEMO_CAPS,
    });
    expect(result.ok).toBe(false);
  });
});

describe("Otorisasi EIP-3009 — tanda tangan transfer", () => {
  it("round-trip: otorisasi yang ditandatangani Bima terpulihkan sebagai Bima", async () => {
    const auth = await signTransferAuthorization(
      bima,
      "Mock USDC",
      31337,
      "0x0000000000000000000000000000000000000003" as Address,
      {
        from: bima.address,
        to: sari.address,
        value: usdc("0.45"),
        validAfter: 1000n,
        validBefore: 4600n,
        nonce: keccak256(toHex("bima-bayar-sari-001")),
      },
    );
    const signer = await recoverTransferAuthorizationSigner(
      "Mock USDC",
      31337,
      "0x0000000000000000000000000000000000000003" as Address,
      {
        from: auth.from,
        to: auth.to,
        value: auth.value,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
      },
      authSignatureHex(auth),
    );
    expect(signer).toBe(bima.address);
  });

  it("nilai yang diubah setelah ditandatangani tidak terpulihkan sebagai Bima", async () => {
    const auth = await signTransferAuthorization(
      bima,
      "Mock USDC",
      31337,
      "0x0000000000000000000000000000000000000003" as Address,
      {
        from: bima.address,
        to: sari.address,
        value: usdc("0.45"),
        validAfter: 1000n,
        validBefore: 4600n,
        nonce: keccak256(toHex("bima-bayar-sari-001")),
      },
    );
    const signer = await recoverTransferAuthorizationSigner(
      "Mock USDC",
      31337,
      "0x0000000000000000000000000000000000000003" as Address,
      { ...auth, value: usdc("0.60") },
      authSignatureHex(auth),
    );
    expect(signer).not.toBe(bima.address);
  });
});

describe("Baca receipt — lewat stub client (tanpa chain)", () => {
  const paymentId = keccak256(toHex("bima-bayar-sari-001"));
  const cannedReceipt = {
    paymentId,
    payer: bima.address,
    payee: sari.address,
    token: USDC_HSP_TESTNET,
    amount: usdc("0.45"),
    mandateHash: keccak256(toHex("mandate-001")),
    txHash: keccak256(toHex("tx-001")),
    recordedAt: 1795610000n,
    memo: "Ringkasan riset 5 sumber — 1 item",
  };
  const cannedText = "SETTLETABLE RECEIPT\npayment: 0x1234\nmemo: Ringkasan riset 5 sumber — 1 item";

  function stubClient(behavior: "found" | "missing") {
    return {
      readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
        if (behavior === "missing") throw new Error("UnknownReceipt");
        if (functionName === "getReceipt") return cannedReceipt;
        if (functionName === "receiptText") return cannedText;
        if (functionName === "receiptsOfPayer") return [cannedReceipt];
        if (functionName === "receiptsOfPayee") return [];
        if (functionName === "receiptCount") return 2n;
        throw new Error(`fungsi ${String(functionName)} tidak dikenal stub`);
      },
    } as unknown as Pick<PublicClient, "readContract">;
  }

  const registry = "0x0000000000000000000000000000000000000004" as Address;

  it("readReceipt mengembalikan receipt + teks dokumen", async () => {
    const { receipt, text } = await readReceipt(stubClient("found"), registry, paymentId);
    expect(receipt.paymentId).toBe(paymentId);
    expect(receipt.payer).toBe(bima.address);
    expect(receipt.payee).toBe(sari.address);
    expect(receipt.amount).toBe(usdc("0.45"));
    expect(receipt.memo).toBe("Ringkasan riset 5 sumber — 1 item");
    expect(text).toContain("SETTLETABLE RECEIPT");
  });

  it("daftar receipt per payer/payee + jumlah total", async () => {
    const client = stubClient("found");
    expect((await listReceiptsOfPayer(client, registry, bima.address)).length).toBe(1);
    expect((await listReceiptsOfPayee(client, registry, sari.address)).length).toBe(0);
    expect(await receiptCount(client, registry)).toBe(2n);
  });

  it("paymentId yang tidak ada melempar error (kontrak revert UnknownReceipt)", async () => {
    await expect(readReceipt(stubClient("missing"), registry, keccak256(toHex("tidak-ada")))).rejects.toThrow(
      "UnknownReceipt",
    );
  });
});

describe("Alur negosiasi + mandate (tanpa chain)", () => {
  it("tawar-menawar lewat modul lalu mandate dibuat dari harga yang disepakati", async () => {
    const service = listServices()[0];
    const neg = startNegotiation({
      serviceId: service.serviceId,
      seller: sari.address,
      buyer: bima.address,
      listPrice: service.listPrice,
    });
    expect(offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS).ok).toBe(true);
    expect(offerPrice(neg, "seller", usdc("0.45"), DEMO_CAPS).ok).toBe(true);
    expect(acceptOffer(neg, "buyer").ok).toBe(true);

    const result = await createMandate({
      negotiation: neg,
      cart: cartForService(service, usdc("0.45")),
      payerAccount: bima,
      chainId: HSK_TESTNET_CHAIN_ID,
      tokenAddress: USDC_HSP_TESTNET,
      chain: "hashkey-testnet",
      token: "USDC",
      caps: DEMO_CAPS,
      nonce: "202611250101",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issued.mandate.payment_amount).toBe(usdc("0.45").toString());
    expect(result.issued.mandate.payee).toBe(sari.address);
    expect(result.issued.mandateHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
