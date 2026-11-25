// Negosiasi harga antar-agen — state machine kecil, tanpa chain.
// Aturan (PLAN.md §2): maks 3 putaran tawar-menawar; tawaran di atas cap
// per transaksi ditolak langsung di sini, dengan alasan yang terbaca —
// supaya guardrail terlihat sebelum mandate dibuat, bukan cuma saat bayar.
// Tawaran harus bergantian: pembeli membuka, penjual membalas, begitu
// seterusnya. Terima/tolak selalu boleh, berapa pun putarannya.
//
// Fungsi-fungsi di sini mengubah objek negosiasi yang diberikan (store
// memegang referensi yang sama) dan mengembalikannya — tidak membuat salinan.

import type { Address } from "viem";
import { checkSpendCaps, type SpendCaps } from "../lib/mandate";

export type NegotiationSide = "buyer" | "seller";

export interface Offer {
  from: NegotiationSide;
  price: bigint; // satuan terkecil USDC
  at: string; // ISO 8601
}

export type NegotiationStatus = "open" | "agreed" | "rejected";

export interface Negotiation {
  id: string;
  serviceId: string;
  seller: Address;
  buyer: Address;
  listPrice: bigint;
  offers: Offer[];
  status: NegotiationStatus;
  agreedPrice?: bigint;
  rejectReason?: string;
}

export type NegotiationResult = { ok: true; negotiation: Negotiation } | { ok: false; reason: string };

/** Maksimal tawaran harga dalam satu negosiasi (PLAN.md §2). */
export const MAX_ROUNDS = 3;

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `neg-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function otherSide(side: NegotiationSide): NegotiationSide {
  return side === "buyer" ? "seller" : "buyer";
}

export function startNegotiation(args: {
  serviceId: string;
  seller: Address;
  buyer: Address;
  listPrice: bigint;
}): Negotiation {
  return {
    id: randomId(),
    serviceId: args.serviceId,
    seller: args.seller,
    buyer: args.buyer,
    listPrice: args.listPrice,
    offers: [],
    status: "open",
  };
}

/** Satu tawaran harga. `spentToday` = yang sudah dibelanjakan pembeli hari ini. */
export function offerPrice(
  negotiation: Negotiation,
  from: NegotiationSide,
  price: bigint,
  caps: SpendCaps,
  spentToday: bigint = 0n,
): NegotiationResult {
  if (negotiation.status !== "open") {
    return { ok: false, reason: `negosiasi sudah ${negotiation.status}` };
  }
  if (price <= 0n) {
    return { ok: false, reason: "harga tawaran harus lebih dari 0" };
  }
  if (negotiation.offers.length >= MAX_ROUNDS) {
    return {
      ok: false,
      reason: `maksimal ${MAX_ROUNDS} putaran negosiasi — terima atau tolak tawaran terakhir`,
    };
  }
  const last = negotiation.offers[negotiation.offers.length - 1];
  if (!last && from !== "buyer") {
    return { ok: false, reason: "tawaran pertama harus dari pembeli" };
  }
  if (last && last.from === from) {
    return { ok: false, reason: `giliran ${otherSide(from) === "buyer" ? "pembeli" : "penjual"} menawar` };
  }
  const cap = checkSpendCaps(price, spentToday, caps);
  if (!cap.ok) return cap;
  negotiation.offers.push({ from, price, at: new Date().toISOString() });
  return { ok: true, negotiation };
}

/** Terima tawaran terakhir — hanya boleh oleh pihak yang tidak menawar terakhir. */
export function acceptOffer(negotiation: Negotiation, by: NegotiationSide): NegotiationResult {
  if (negotiation.status !== "open") {
    return { ok: false, reason: `negosiasi sudah ${negotiation.status}` };
  }
  const last = negotiation.offers[negotiation.offers.length - 1];
  if (!last) {
    return { ok: false, reason: "belum ada tawaran untuk diterima" };
  }
  if (last.from === by) {
    return { ok: false, reason: "tidak bisa menerima tawaran sendiri" };
  }
  negotiation.status = "agreed";
  negotiation.agreedPrice = last.price;
  return { ok: true, negotiation };
}

/** Tolak negosiasi — selesai, tidak bisa dibuka lagi. */
export function rejectOffer(
  negotiation: Negotiation,
  by: NegotiationSide,
  reason = "ditolak",
): NegotiationResult {
  if (negotiation.status !== "open") {
    return { ok: false, reason: `negosiasi sudah ${negotiation.status}` };
  }
  void by;
  negotiation.status = "rejected";
  negotiation.rejectReason = reason;
  return { ok: true, negotiation };
}

/** Harga + pihak yang disepakati — dipakai membuat mandate. */
export function agreedTerms(negotiation: Negotiation): {
  serviceId: string;
  seller: Address;
  buyer: Address;
  price: bigint;
} {
  if (negotiation.status !== "agreed" || negotiation.agreedPrice === undefined) {
    throw new Error("negosiasi belum disepakati — mandate tidak bisa dibuat");
  }
  return {
    serviceId: negotiation.serviceId,
    seller: negotiation.seller,
    buyer: negotiation.buyer,
    price: negotiation.agreedPrice,
  };
}

/** Versi JSON dari negosiasi (bigint jadi string) — untuk API. */
export function negotiationToJson(negotiation: Negotiation): Record<string, unknown> {
  return {
    id: negotiation.id,
    serviceId: negotiation.serviceId,
    seller: negotiation.seller,
    buyer: negotiation.buyer,
    listPrice: negotiation.listPrice.toString(),
    offers: negotiation.offers.map((offer) => ({
      from: offer.from,
      price: offer.price.toString(),
      at: offer.at,
    })),
    status: negotiation.status,
    agreedPrice: negotiation.agreedPrice?.toString(),
    rejectReason: negotiation.rejectReason,
  };
}
