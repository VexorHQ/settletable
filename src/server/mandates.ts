// Siklus hidup Payment Mandate (Cart Mandate EIP-712) di sisi server.
// Server TIDAK memegang kunci pembeli: createMandate menerima akun pembeli
// (wallet demo dari .env, atau akun lokal untuk tes) dan menandatangani
// atas namanya. Route API /api/mandates "create" hanya membangun mandate
// tanpa tanda tangan — penandatangan ada di client.
//
// Satu mandate = satu pembayaran: nonce tidak bisa dipakai dua kali, dan
// mandate bisa dicabut sebelum dipakai (PLAN.md §2).

import type { Account, Address, Hex } from "viem";
import {
  type CapCheck,
  type CartMandate,
  type SpendCaps,
  type SpendLedger,
  cartHash,
  cartMandateAmount,
  cartMandateExpired,
  cartMandateHash,
  checkSpendCaps,
  formatUsdc,
  oneHourExpiry,
  randomCartNonce,
  signCartMandate,
  verifyCartMandate,
} from "../lib/mandate";
import type { CartItem } from "./terms";
import type { Negotiation } from "./negotiate";

export interface IssuedMandate {
  mandate: CartMandate;
  signature: Hex;
  mandateHash: Hex;
  payer: Address;
}

export type MandateResult = { ok: true; issued: IssuedMandate } | { ok: false; reason: string };

/** Bangun Cart Mandate dari negosiasi yang sudah disepakati (belum ditandatangani). */
export function buildCartMandate(args: {
  negotiation: Negotiation;
  cart: CartItem[];
  chain: string;
  token: string;
  nonce?: string;
  expiry?: string;
}): CartMandate {
  if (args.negotiation.status !== "agreed" || args.negotiation.agreedPrice === undefined) {
    throw new Error("mandate hanya bisa dibuat dari negosiasi yang sudah disepakati");
  }
  return {
    chain: args.chain,
    token: args.token,
    payment_amount: args.negotiation.agreedPrice.toString(),
    payment_amount_usd: formatUsdc(args.negotiation.agreedPrice),
    payee: args.negotiation.seller,
    nonce: args.nonce ?? randomCartNonce(),
    expiry: args.expiry ?? oneHourExpiry(),
    cart_hash: cartHash(args.cart),
  };
}

/**
 * Buat + tandatangani mandate. Cap dicek di sini juga — negosiasi sudah
 * menolak tawaran di atas cap, tapi mandate bisa dibuat dari negosiasi lama
 * yang belanja hariannya sudah berubah sejak disepakati.
 */
export async function createMandate(args: {
  negotiation: Negotiation;
  cart: CartItem[];
  payerAccount: Account;
  chainId: number;
  tokenAddress: Address;
  chain: string;
  token: string;
  caps: SpendCaps;
  spentToday?: bigint;
  nonce?: string;
  expiry?: string;
}): Promise<MandateResult> {
  const amount = args.negotiation.agreedPrice;
  if (amount === undefined) {
    return { ok: false, reason: "negosiasi belum disepakati" };
  }
  const cap = checkSpendCaps(amount, args.spentToday ?? 0n, args.caps);
  if (!cap.ok) return cap;
  const mandate = buildCartMandate(args);
  const signature = await signCartMandate(args.payerAccount, args.chainId, args.tokenAddress, mandate);
  const mandateHash = cartMandateHash(args.chainId, args.tokenAddress, mandate);
  return { ok: true, issued: { mandate, signature, mandateHash, payer: args.payerAccount.address } };
}

/** Mandate yang diterbitkan + yang dicabut (in-memory, PLAN.md §5). */
export class MandateStore {
  private issued = new Map<string, IssuedMandate>(); // kunci: nonce
  private revoked = new Set<string>();

  issue(issued: IssuedMandate): void {
    this.issued.set(issued.mandate.nonce, issued);
  }

  get(nonce: string): IssuedMandate | undefined {
    return this.issued.get(nonce);
  }

  /** Cabut mandate sebelum dipakai. false bila nonce tidak dikenal. */
  revoke(nonce: string): boolean {
    if (!this.issued.has(nonce)) return false;
    this.revoked.add(nonce);
    return true;
  }

  isRevoked(nonce: string): boolean {
    return this.revoked.has(nonce);
  }
}

/**
 * Semua cek sebelum uang bergerak — dipakai settle.ts. Urutannya disengaja:
 * kedaluwarsa dulu (paling murah), tanda tangan, cabut, nonce, baru cap.
 */
export async function verifyMandateForSettle(args: {
  chainId: number;
  tokenAddress: Address;
  mandate: CartMandate;
  signature: Hex;
  expectedPayer: Address;
  store: MandateStore;
  ledger: SpendLedger;
  caps: SpendCaps;
}): Promise<CapCheck> {
  const { mandate, signature, expectedPayer } = args;
  if (cartMandateExpired(mandate)) {
    return { ok: false, reason: `mandate kedaluwarsa pada ${mandate.expiry}` };
  }
  if (!(await verifyCartMandate(args.chainId, args.tokenAddress, mandate, signature, expectedPayer))) {
    return { ok: false, reason: "tanda tangan mandate tidak cocok dengan pembeli" };
  }
  if (args.store.isRevoked(mandate.nonce)) {
    return { ok: false, reason: `mandate dengan nonce ${mandate.nonce} sudah dicabut` };
  }
  if (args.ledger.isNonceUsed(mandate.nonce)) {
    return { ok: false, reason: `nonce ${mandate.nonce} sudah dipakai` };
  }
  return args.ledger.canSpend(expectedPayer, cartMandateAmount(mandate), args.caps);
}
