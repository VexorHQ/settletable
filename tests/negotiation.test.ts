// Unit test negosiasi (PLAN.md §9) — tanpa chain.
// Skenario demo: Sari pasang 0,50; Bima tawar 0,40; Sari balas 0,45;
// Bima terima. Cap: 0,50 USDC/transaksi, 5,00 USDC/hari.

import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { usdc, type SpendCaps } from "../src/lib/mandate";
import { listServices } from "../src/server/terms";
import {
  acceptOffer,
  agreedTerms,
  offerPrice,
  rejectOffer,
  startNegotiation,
  type Negotiation,
} from "../src/server/negotiate";

const DEMO_CAPS: SpendCaps = { perTxCap: usdc("0.50"), dailyCap: usdc("5.00") };

const bima = privateKeyToAccount(generatePrivateKey());
const sari = privateKeyToAccount(generatePrivateKey());

function freshNegotiation(): Negotiation {
  const service = listServices()[0];
  return startNegotiation({
    serviceId: service.serviceId,
    seller: sari.address,
    buyer: bima.address,
    listPrice: service.listPrice,
  });
}

describe("Negosiasi Bima x Sari", () => {
  it("mulai dari harga katalog 0,50, status open, belum ada tawaran", () => {
    const neg = freshNegotiation();
    expect(neg.listPrice).toBe(usdc("0.50"));
    expect(neg.status).toBe("open");
    expect(neg.offers).toEqual([]);
  });

  it("alur demo: 0,40 ditawar, 0,45 dibalas, diterima — harga akhir 0,45", () => {
    const neg = freshNegotiation();
    expect(offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS).ok).toBe(true);
    expect(offerPrice(neg, "seller", usdc("0.45"), DEMO_CAPS).ok).toBe(true);
    const accepted = acceptOffer(neg, "buyer");
    expect(accepted.ok).toBe(true);
    expect(neg.status).toBe("agreed");
    expect(neg.agreedPrice).toBe(usdc("0.45"));
    expect(agreedTerms(neg).price).toBe(usdc("0.45"));
  });

  it("tawaran 0,60 ditolak di atas cap — negosiasi tetap terbuka, tawaran tidak tercatat", () => {
    const neg = freshNegotiation();
    const result = offerPrice(neg, "buyer", usdc("0.60"), DEMO_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cap per transaksi");
    expect(neg.offers).toEqual([]);
    expect(neg.status).toBe("open");
    // Sesudah ditolak, tawaran yang wajar masih bisa masuk.
    expect(offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS).ok).toBe(true);
  });

  it("tawaran di atas cap harian juga ditolak (Bima sudah belanja 4,80 hari ini)", () => {
    const neg = freshNegotiation();
    const result = offerPrice(neg, "buyer", usdc("0.45"), DEMO_CAPS, usdc("4.80"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cap harian");
    // 0,20 masih muat (4,80 + 0,20 = 5,00 pas).
    expect(offerPrice(neg, "buyer", usdc("0.20"), DEMO_CAPS, usdc("4.80")).ok).toBe(true);
  });

  it("tawaran 0 atau negatif ditolak", () => {
    const neg = freshNegotiation();
    expect(offerPrice(neg, "buyer", 0n, DEMO_CAPS).ok).toBe(false);
    expect(offerPrice(neg, "buyer", -1n, DEMO_CAPS).ok).toBe(false);
  });

  it("tawaran harus bergantian dan dibuka pembeli", () => {
    const neg = freshNegotiation();
    const sellerOpens = offerPrice(neg, "seller", usdc("0.45"), DEMO_CAPS);
    expect(sellerOpens.ok).toBe(false);
    if (!sellerOpens.ok) expect(sellerOpens.reason).toContain("pembeli");
    expect(offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS).ok).toBe(true);
    const twice = offerPrice(neg, "buyer", usdc("0.42"), DEMO_CAPS);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.reason).toContain("giliran");
  });

  it("maksimal 3 putaran: tawaran ke-4 ditolak, terima tawaran terakhir tetap bisa", () => {
    const neg = freshNegotiation();
    expect(offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS).ok).toBe(true);
    expect(offerPrice(neg, "seller", usdc("0.48"), DEMO_CAPS).ok).toBe(true);
    expect(offerPrice(neg, "buyer", usdc("0.44"), DEMO_CAPS).ok).toBe(true);
    const fourth = offerPrice(neg, "seller", usdc("0.45"), DEMO_CAPS);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toContain("3 putaran");
    expect(acceptOffer(neg, "seller").ok).toBe(true);
    expect(neg.agreedPrice).toBe(usdc("0.44"));
  });

  it("terima tanpa tawaran gagal; terima tawaran sendiri gagal", () => {
    const neg = freshNegotiation();
    expect(acceptOffer(neg, "buyer").ok).toBe(false);
    offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS);
    expect(acceptOffer(neg, "buyer").ok).toBe(false);
    expect(acceptOffer(neg, "seller").ok).toBe(true);
  });

  it("tolak menutup negosiasi — tawaran dan terima sesudahnya gagal", () => {
    const neg = freshNegotiation();
    offerPrice(neg, "buyer", usdc("0.40"), DEMO_CAPS);
    const rejected = rejectOffer(neg, "seller", "harga terlalu rendah");
    expect(rejected.ok).toBe(true);
    expect(neg.status).toBe("rejected");
    expect(neg.rejectReason).toBe("harga terlalu rendah");
    expect(offerPrice(neg, "seller", usdc("0.45"), DEMO_CAPS).ok).toBe(false);
    expect(acceptOffer(neg, "buyer").ok).toBe(false);
    expect(() => agreedTerms(neg)).toThrow("belum disepakati");
  });
});
