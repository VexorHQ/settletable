// Unit test mandate EIP-712 + validasi cap (PLAN.md §9).
// Skenario demo: Bima (pembeli) membeli "Ringkasan riset 5 sumber" dari Sari
// (penjual) seharga 0,45 USDC hasil negosiasi. Cap: 0,50 USDC/transaksi,
// 5,00 USDC/hari. Token settlement: USDC HSP testnet 133.

import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, keccak256, toHex } from "viem";
import {
  type CartMandate,
  type HspMandate,
  type SpendCaps,
  SpendLedger,
  cartHash,
  cartMandateAmount,
  cartMandateExpired,
  cartMandateHash,
  checkSpendCaps,
  formatUsdc,
  hspMandateExpired,
  hspMandateHash,
  oneHourExpiry,
  randomCartNonce,
  randomHspNonce,
  signCartMandate,
  signHspMandate,
  usdc,
  verifyCartMandate,
  verifyHspMandate,
} from "../src/lib/mandate";

const HSK_TESTNET_CHAIN_ID = 133;
// USDC HSP testnet (RESEARCH.md §3, terverifikasi on-chain 25 Nov 2026).
const USDC_HSP_TESTNET = "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6" as const;
// Alamat adapter HSP Protocol belum dipublikasikan (placeholder di docs) —
// untuk test ini pakai alamat dummy yang jelas-jelas bukan alamat asli.
const ADAPTER_PLACEHOLDER = "0x0000000000000000000000000000000000000001" as const;

const DEMO_CAPS: SpendCaps = { perTxCap: usdc("0.50"), dailyCap: usdc("5.00") };

const bima = privateKeyToAccount(generatePrivateKey());
const sari = privateKeyToAccount(generatePrivateKey());

function demoCartMandate(overrides: Partial<CartMandate> = {}): CartMandate {
  const cart = [{ item_id: "riset-5-sumber", name: "Ringkasan riset 5 sumber", price: "0.45", quantity: 1 }];
  return {
    chain: "hashkey-testnet",
    token: "USDC",
    payment_amount: usdc("0.45").toString(),
    payment_amount_usd: "0.45",
    payee: sari.address,
    nonce: randomCartNonce(),
    expiry: oneHourExpiry(),
    cart_hash: cartHash(cart),
    ...overrides,
  };
}

function demoHspMandate(overrides: Partial<HspMandate> = {}): HspMandate {
  return {
    payment_id: keccak256(toHex("bima-bayar-sari-001")),
    payer: bima.address,
    recipient: sari.address,
    token: USDC_HSP_TESTNET,
    amount: usdc("0.45"),
    token_amount: usdc("0.45"),
    nonce: randomHspNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    chain_id: 133n,
    requirements_hash: keccak256(toHex("ringkasan 5 sumber, selesai maks 10 menit")),
    ...overrides,
  };
}

describe("Cart Mandate (HashKey Merchant)", () => {
  it("round-trip: tanda tangan Bima terverifikasi sebagai Bima", async () => {
    const mandate = demoCartMandate();
    const signature = await signCartMandate(bima, HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
    expect(await verifyCartMandate(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate, signature, bima.address)).toBe(true);
    // Bukan Sari: yang menandatangani mandate adalah pembeli.
    expect(await verifyCartMandate(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate, signature, sari.address)).toBe(false);
  });

  it("mandate yang diubah setelah ditandatangani tidak lolos verifikasi", async () => {
    const mandate = demoCartMandate();
    const signature = await signCartMandate(bima, HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
    const changed = { ...mandate, payment_amount: usdc("0.60").toString() };
    expect(await verifyCartMandate(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, changed, signature, bima.address)).toBe(false);
  });

  it("hash mandate stabil dan 32 byte", () => {
    const mandate = demoCartMandate({ nonce: "1234567890123456" });
    const hash = cartMandateHash(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(cartMandateHash(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate)).toBe(hash);
    expect(cartMandateAmount(mandate)).toBe(usdc("0.45"));
  });

  it("mandate kedaluwarsa terdeteksi", () => {
    const expired = demoCartMandate({ expiry: new Date(Date.now() - 1000).toISOString() });
    expect(cartMandateExpired(expired)).toBe(true);
    expect(cartMandateExpired(demoCartMandate())).toBe(false);
  });
});

describe("HSP Protocol Mandate (HashFans guide)", () => {
  it("round-trip: tanda tangan Bima terverifikasi sebagai Bima", async () => {
    const mandate = demoHspMandate();
    const signature = await signHspMandate(bima, HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, mandate);
    expect(
      await verifyHspMandate(HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, mandate, signature, bima.address),
    ).toBe(true);
  });

  it("penerima yang diubah setelah ditandatangani tidak lolos verifikasi", async () => {
    const mandate = demoHspMandate();
    const signature = await signHspMandate(bima, HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, mandate);
    const changed = { ...mandate, recipient: getAddress("0x0000000000000000000000000000000000000002") };
    expect(
      await verifyHspMandate(HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, changed, signature, bima.address),
    ).toBe(false);
  });

  it("hash mandate stabil dan mandate kedaluwarsa terdeteksi", () => {
    const mandate = demoHspMandate({ nonce: 42n });
    const hash = hspMandateHash(HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, mandate);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hspMandateHash(HSK_TESTNET_CHAIN_ID, ADAPTER_PLACEHOLDER, mandate)).toBe(hash);
    expect(hspMandateExpired(demoHspMandate())).toBe(false);
    expect(hspMandateExpired(demoHspMandate({ expiry: BigInt(Math.floor(Date.now() / 1000) - 10) }))).toBe(true);
  });
});

describe("Validasi cap (demo Bima x Sari)", () => {
  it("bayar 0,45 USDC lolos: di bawah cap transaksi 0,50 dan cap harian 5,00", () => {
    expect(checkSpendCaps(usdc("0.45"), 0n, DEMO_CAPS)).toEqual({ ok: true });
  });

  it("bayar 0,60 USDC ditolak: melewati cap per transaksi", () => {
    const check = checkSpendCaps(usdc("0.60"), 0n, DEMO_CAPS);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("cap per transaksi");
  });

  it("bayar tepat di cap 0,50 USDC lolos (batas inklusif)", () => {
    expect(checkSpendCaps(usdc("0.50"), 0n, DEMO_CAPS)).toEqual({ ok: true });
  });

  it("akumulasi harian melewati 5,00 USDC ditolak", () => {
    // Bima sudah belanja 4,80 hari ini; 0,45 lagi = 5,25 > 5,00.
    const check = checkSpendCaps(usdc("0.45"), usdc("4.80"), DEMO_CAPS);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("cap harian");
    // Tapi 0,20 masih muat (4,80 + 0,20 = 5,00 pas).
    expect(checkSpendCaps(usdc("0.20"), usdc("4.80"), DEMO_CAPS)).toEqual({ ok: true });
  });

  it("jumlah nol atau negatif ditolak", () => {
    expect(checkSpendCaps(0n, 0n, DEMO_CAPS).ok).toBe(false);
  });
});

describe("SpendLedger — catatan harian + nonce", () => {
  it("mencatat 0,45 lalu menolak nonce yang sama dipakai dua kali", () => {
    const ledger = new SpendLedger();
    const nonce = "9876543210987654";
    expect(ledger.record(bima.address, usdc("0.45"), nonce, DEMO_CAPS)).toEqual({ ok: true });
    expect(ledger.spentToday(bima.address)).toBe(usdc("0.45"));
    const second = ledger.record(bima.address, usdc("0.45"), nonce, DEMO_CAPS);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toContain("sudah dipakai");
    // Saldo harian tidak bertambah oleh percobaan kedua.
    expect(ledger.spentToday(bima.address)).toBe(usdc("0.45"));
  });

  it("tiga ringkasan 0,45 + belanja lain sampai 5,00 pas, lalu 0,01 ditolak", () => {
    const ledger = new SpendLedger();
    for (let i = 0; i < 3; i++) {
      expect(ledger.record(bima.address, usdc("0.45"), `nonce-a${i}`, DEMO_CAPS)).toEqual({ ok: true });
    }
    // 1,35 terpakai; tambah 0,50 x7 = 3,50 -> total 4,85; tambah 0,15 -> 5,00 pas.
    for (let i = 0; i < 7; i++) {
      expect(ledger.record(bima.address, usdc("0.50"), `nonce-b${i}`, DEMO_CAPS)).toEqual({ ok: true });
    }
    expect(ledger.record(bima.address, usdc("0.15"), "nonce-c0", DEMO_CAPS)).toEqual({ ok: true });
    expect(ledger.spentToday(bima.address)).toBe(usdc("5.00"));
    expect(ledger.record(bima.address, usdc("0.01"), "nonce-c1", DEMO_CAPS).ok).toBe(false);
  });

  it("catatan Sari tidak tercampur dengan Bima", () => {
    const ledger = new SpendLedger();
    ledger.record(bima.address, usdc("0.45"), "n1", DEMO_CAPS);
    expect(ledger.spentToday(sari.address)).toBe(0n);
  });
});

describe("Alur demo end-to-end (tanpa chain)", () => {
  it("negosiasi 0,45 -> mandate -> verifikasi -> cap -> catat -> hash siap direceipt", async () => {
    // 1. Negosiasi: Sari pasang 0,50; Bima tawar 0,40; Sari balas 0,45; Bima terima.
    const agreedPrice = usdc("0.45");

    // 2. Bima membuat + menandatangani Cart Mandate.
    const mandate = demoCartMandate({ payment_amount: agreedPrice.toString(), payment_amount_usd: "0.45" });
    const signature = await signCartMandate(bima, HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);

    // 3. Server memverifikasi sebelum uang bergerak.
    expect(cartMandateExpired(mandate)).toBe(false);
    expect(await verifyCartMandate(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate, signature, bima.address)).toBe(true);

    // 4. Guardrail cap.
    const ledger = new SpendLedger();
    const check = ledger.record(bima.address, cartMandateAmount(mandate), mandate.nonce, DEMO_CAPS);
    expect(check).toEqual({ ok: true });

    // 5. Hash mandate siap ditulis ke ReceiptRegistry sebagai mandateHash.
    const mandateHash = cartMandateHash(HSK_TESTNET_CHAIN_ID, USDC_HSP_TESTNET, mandate);
    expect(mandateHash).toMatch(/^0x[0-9a-f]{64}$/);

    // 6. Percobaan kedua di hari yang sama, 0,60 USDC — ditolak SEBELUM tanda tangan.
    const overCap = checkSpendCaps(usdc("0.60"), ledger.spentToday(bima.address), DEMO_CAPS);
    expect(overCap.ok).toBe(false);
  });
});

describe("Util USDC", () => {
  it("usdc() dan formatUsdc() bolak-balik tanpa kehilangan", () => {
    expect(usdc("0.45")).toBe(450_000n);
    expect(usdc("5")).toBe(5_000_000n);
    expect(usdc("0.000001")).toBe(1n);
    expect(formatUsdc(450_000n)).toBe("0.45");
    expect(formatUsdc(5_000_000n)).toBe("5");
    expect(formatUsdc(1n)).toBe("0.000001");
  });
});
