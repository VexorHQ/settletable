// POST /api/negotiations — satu endpoint, dispatch berdasarkan action:
//   start  { serviceId, seller, buyer }          -> negosiasi baru
//   offer  { id, from: "buyer"|"seller", price } -> satu tawaran (desimal, mis. "0.40")
//   accept { id, by: "buyer"|"seller" }          -> terima tawaran terakhir
//   reject { id, by, reason? }                   -> tolak negosiasi
// State hidup di store in-memory (satu proses Next.js = satu store).

import { NextResponse } from "next/server";
import type { Address } from "viem";
import { usdc } from "../../../lib/mandate";
import { findService } from "../../../server/terms";
import {
  acceptOffer,
  negotiationToJson,
  offerPrice,
  rejectOffer,
  startNegotiation,
  type NegotiationSide,
} from "../../../server/negotiate";
import { getStore } from "../../../server/store";

function fail(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const store = getStore();

  if (body.action === "start") {
    const service = findService(String(body.serviceId ?? ""));
    if (!service) return fail(`jasa ${String(body.serviceId ?? "")} tidak ada di katalog`);
    if (!body.seller || !body.buyer) return fail("seller dan buyer wajib diisi");
    const negotiation = startNegotiation({
      serviceId: service.serviceId,
      seller: body.seller as Address,
      buyer: body.buyer as Address,
      listPrice: service.listPrice,
    });
    store.negotiations.set(negotiation.id, negotiation);
    return NextResponse.json({ ok: true, negotiation: negotiationToJson(negotiation) });
  }

  const negotiation = store.negotiations.get(String(body.id ?? ""));
  if (!negotiation) return fail(`negosiasi ${String(body.id ?? "")} tidak ditemukan`, 404);

  if (body.action === "offer") {
    if (body.from !== "buyer" && body.from !== "seller") return fail('from harus "buyer" atau "seller"');
    if (typeof body.price !== "string") return fail("price harus string desimal, mis. \"0.40\"");
    const result = offerPrice(
      negotiation,
      body.from as NegotiationSide,
      usdc(body.price),
      store.caps,
      store.ledger.spentToday(negotiation.buyer),
    );
    if (!result.ok) return fail(result.reason);
    return NextResponse.json({ ok: true, negotiation: negotiationToJson(result.negotiation) });
  }

  if (body.action === "accept") {
    if (body.by !== "buyer" && body.by !== "seller") return fail('by harus "buyer" atau "seller"');
    const result = acceptOffer(negotiation, body.by as NegotiationSide);
    if (!result.ok) return fail(result.reason);
    return NextResponse.json({ ok: true, negotiation: negotiationToJson(result.negotiation) });
  }

  if (body.action === "reject") {
    const result = rejectOffer(
      negotiation,
      body.by === "seller" ? "seller" : "buyer",
      typeof body.reason === "string" ? body.reason : undefined,
    );
    if (!result.ok) return fail(result.reason);
    return NextResponse.json({ ok: true, negotiation: negotiationToJson(result.negotiation) });
  }

  return fail('action tidak dikenal — pakai "start", "offer", "accept", atau "reject"');
}
