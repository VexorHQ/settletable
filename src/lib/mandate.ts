// Mandate EIP-712 + validasi cap — logika murni, tidak ada kunci privat di sini.
//
// Dua format mandate (sumber: RESEARCH.md §3, dokumen HSP 25 Nov 2026):
//  1. Cart Mandate — HashKey Merchant API. Domain "HashKey Merchant Cart".
//     verifyingContract = alamat kontrak token (USDC HSP di testnet).
//  2. HSP Protocol Mandate — HashFans guide. Domain "HSP Payment Mandate".
//     verifyingContract = alamat adapter (placeholder sampai organizer
//     membagikan alamat aslinya; jangan karang alamat adapter).
//
// Cap: guardrail demo Bima x Sari — cap per transaksi 0,50 USDC, cap harian
// 5,00 USDC (patokan yang sama dipakai AgentSettle, RESEARCH.md §5).

import {
  type Account,
  type Address,
  type Hex,
  getAddress,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  toHex,
} from "viem";

// ---------------------------------------------------------------------------
// Cart Mandate (HashKey Merchant API)
// ---------------------------------------------------------------------------

export interface CartMandate {
  chain: string; // mis. "hashkey-testnet"
  token: string; // mis. "USDC"
  payment_amount: string; // satuan terkecil, mis. "450000" = 0,45 USDC
  payment_amount_usd: string; // 2 desimal, mis. "0.45"
  payee: Address;
  nonce: string; // angka acak sebagai string
  expiry: string; // ISO 8601 UTC, mis. "2026-11-27T10:35:00.000Z"
  cart_hash: Hex; // hex SHA-256 isi Cart, 64 karakter
}

export const CART_MANDATE_TYPES = {
  CartMandate: [
    { name: "chain", type: "string" },
    { name: "token", type: "string" },
    { name: "payment_amount", type: "string" },
    { name: "payment_amount_usd", type: "string" },
    { name: "payee", type: "address" },
    { name: "nonce", type: "string" },
    { name: "expiry", type: "string" },
    { name: "cart_hash", type: "bytes32" },
  ],
} as const;

export function cartMandateDomain(chainId: number, tokenAddress: Address) {
  return {
    name: "HashKey Merchant Cart",
    version: "1",
    chainId,
    verifyingContract: tokenAddress,
  } as const;
}

/** Hash EIP-712 mandate — dipakai juga sebagai mandateHash di ReceiptRegistry. */
export function cartMandateHash(chainId: number, tokenAddress: Address, mandate: CartMandate): Hex {
  return hashTypedData({
    domain: cartMandateDomain(chainId, tokenAddress),
    types: CART_MANDATE_TYPES,
    primaryType: "CartMandate",
    message: mandate,
  });
}

export async function signCartMandate(
  signer: Account,
  chainId: number,
  tokenAddress: Address,
  mandate: CartMandate,
): Promise<Hex> {
  // Akun viem ada yang read-only (tanpa kunci) — tangkap di sini, bukan
  // lewat error "possibly undefined" yang tidak jelas.
  if (!signer.signTypedData) throw new Error("akun ini tidak bisa menandatangani typed data");
  return signer.signTypedData({
    domain: cartMandateDomain(chainId, tokenAddress),
    types: CART_MANDATE_TYPES,
    primaryType: "CartMandate",
    message: mandate,
  });
}

export async function recoverCartMandateSigner(
  chainId: number,
  tokenAddress: Address,
  mandate: CartMandate,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: cartMandateDomain(chainId, tokenAddress),
    types: CART_MANDATE_TYPES,
    primaryType: "CartMandate",
    message: mandate,
    signature,
  });
}

/** Benar hanya bila penandatangan = payer yang diharapkan DAN isi mandate utuh. */
export async function verifyCartMandate(
  chainId: number,
  tokenAddress: Address,
  mandate: CartMandate,
  signature: Hex,
  expectedPayer: Address,
): Promise<boolean> {
  const signer = await recoverCartMandateSigner(chainId, tokenAddress, mandate, signature);
  return getAddress(signer) === getAddress(expectedPayer);
}

export function cartMandateExpired(mandate: CartMandate, now: Date = new Date()): boolean {
  return Date.parse(mandate.expiry) <= now.getTime();
}

/** Jumlah dalam satuan terkecil token. */
export function cartMandateAmount(mandate: CartMandate): bigint {
  return BigInt(mandate.payment_amount);
}

// ---------------------------------------------------------------------------
// HSP Protocol Mandate (HashFans guide)
// ---------------------------------------------------------------------------

export interface HspMandate {
  payment_id: Hex; // bytes32, id unik pembayaran
  payer: Address;
  recipient: Address;
  token: Address;
  amount: bigint; // satuan terkecil
  token_amount: bigint; // jumlah token (1:1 dengan amount untuk USDC)
  nonce: bigint;
  expiry: bigint; // unix seconds
  chain_id: bigint;
  requirements_hash: Hex; // bytes32, hash syarat pembayaran
}

const HSP_MANDATE_TYPES = {
  Mandate: [
    { name: "payment_id", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "token_amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "chain_id", type: "uint256" },
    { name: "requirements_hash", type: "bytes32" },
  ],
} as const;

export function hspMandateDomain(chainId: number, adapterAddress: Address) {
  return {
    name: "HSP Payment Mandate",
    version: "1",
    chainId,
    verifyingContract: adapterAddress,
  } as const;
}

export function hspMandateHash(chainId: number, adapterAddress: Address, mandate: HspMandate): Hex {
  return hashTypedData({
    domain: hspMandateDomain(chainId, adapterAddress),
    types: HSP_MANDATE_TYPES,
    primaryType: "Mandate",
    message: mandate,
  });
}

export async function signHspMandate(
  signer: Account,
  chainId: number,
  adapterAddress: Address,
  mandate: HspMandate,
): Promise<Hex> {
  if (!signer.signTypedData) throw new Error("akun ini tidak bisa menandatangani typed data");
  return signer.signTypedData({
    domain: hspMandateDomain(chainId, adapterAddress),
    types: HSP_MANDATE_TYPES,
    primaryType: "Mandate",
    message: mandate,
  });
}

export async function recoverHspMandateSigner(
  chainId: number,
  adapterAddress: Address,
  mandate: HspMandate,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: hspMandateDomain(chainId, adapterAddress),
    types: HSP_MANDATE_TYPES,
    primaryType: "Mandate",
    message: mandate,
    signature,
  });
}

export async function verifyHspMandate(
  chainId: number,
  adapterAddress: Address,
  mandate: HspMandate,
  signature: Hex,
  expectedPayer: Address,
): Promise<boolean> {
  const signer = await recoverHspMandateSigner(chainId, adapterAddress, mandate, signature);
  return getAddress(signer) === getAddress(expectedPayer);
}

export function hspMandateExpired(mandate: HspMandate, nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000))): boolean {
  return mandate.expiry <= nowSeconds;
}

// ---------------------------------------------------------------------------
// Cap — guardrail belanja (per transaksi + per hari)
// ---------------------------------------------------------------------------

export interface SpendCaps {
  perTxCap: bigint; // satuan terkecil, mis. 500_000n = 0,50 USDC
  dailyCap: bigint; // mis. 5_000_000n = 5,00 USDC
}

export type CapCheck = { ok: true } | { ok: false; reason: string };

export function checkSpendCaps(amount: bigint, spentToday: bigint, caps: SpendCaps): CapCheck {
  if (amount <= 0n) return { ok: false, reason: "jumlah harus lebih dari 0" };
  if (amount > caps.perTxCap) {
    return {
      ok: false,
      reason: `jumlah ${formatUsdc(amount)} USDC melewati cap per transaksi ${formatUsdc(caps.perTxCap)} USDC`,
    };
  }
  if (spentToday + amount > caps.dailyCap) {
    return {
      ok: false,
      reason: `total hari ini ${formatUsdc(spentToday + amount)} USDC melewati cap harian ${formatUsdc(caps.dailyCap)} USDC`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SpendLedger — catatan belanja harian + nonce yang sudah dipakai (in-memory).
// Demo tidak pakai database (PLAN.md §5); server menyimpan ini di file JSON.
// Hari dihitung UTC supaya tidak bergantung zona waktu server.
// ---------------------------------------------------------------------------

export class SpendLedger {
  private spent = new Map<string, bigint>();
  private usedNonces = new Set<string>();

  private dayKey(payer: Address, now: Date = new Date()): string {
    return `${payer.toLowerCase()}-${now.toISOString().slice(0, 10)}`;
  }

  spentToday(payer: Address, now: Date = new Date()): bigint {
    return this.spent.get(this.dayKey(payer, now)) ?? 0n;
  }

  isNonceUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  canSpend(payer: Address, amount: bigint, caps: SpendCaps, now: Date = new Date()): CapCheck {
    return checkSpendCaps(amount, this.spentToday(payer, now), caps);
  }

  /** Catat pembayaran bila lolos cap DAN nonce belum pernah dipakai. */
  record(payer: Address, amount: bigint, nonce: string, caps: SpendCaps, now: Date = new Date()): CapCheck {
    if (this.usedNonces.has(nonce)) {
      return { ok: false, reason: `nonce ${nonce} sudah dipakai` };
    }
    const check = this.canSpend(payer, amount, caps, now);
    if (!check.ok) return check;
    const key = this.dayKey(payer, now);
    this.spent.set(key, (this.spent.get(key) ?? 0n) + amount);
    this.usedNonces.add(nonce);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Util kecil
// ---------------------------------------------------------------------------

/** "0.45" -> 450000n (USDC 6 desimal). Tanpa floating point. */
export function usdc(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole || "0") * 1_000_000n + BigInt(padded);
}

/** 450000n -> "0.45". */
export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Hash isi cart (JSON) jadi cart_hash 32 byte. */
export function cartHash(cart: unknown): Hex {
  return keccak256(toHex(JSON.stringify(cart)));
}

/** Nonce acak 16 digit untuk Cart Mandate (string, sesuai dokumen Merchant). */
export function randomCartNonce(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nonce acak untuk HSP Mandate (uint256). */
export function randomHspNonce(): bigint {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

/** Masa berlaku 1 jam dari sekarang, format ISO 8601 UTC (Cart Mandate). */
export function oneHourExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}
