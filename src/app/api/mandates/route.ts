// POST /api/mandates — satu endpoint, dispatch berdasarkan action:
//   create { negotiationId, chain, token, chainId, tokenAddress }
//          -> mandate TANPA tanda tangan + domain + types + hash, supaya
//             client (wallet pembeli) yang menandatangani. Server tidak
//             pernah memegang kunci pembeli.
//   verify { mandate, signature, expectedPayer, chainId, tokenAddress }
//          -> semua cek sebelum bayar (tanda tangan, kedaluwarsa, cabut,
//             nonce, cap). Tidak mengubah state.
//   revoke { nonce } -> cabut mandate sebelum dipakai.

import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import {
  CART_MANDATE_TYPES,
  cartMandateDomain,
  cartMandateHash,
  type CartMandate,
} from "../../../lib/mandate";
import { buildCartMandate, verifyMandateForSettle } from "../../../server/mandates";
import { agreedTerms } from "../../../server/negotiate";
import { cartForService, findService } from "../../../server/terms";
import { getStore } from "../../../server/store";

function fail(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const store = getStore();

  if (body.action === "create") {
    const negotiation = store.negotiations.get(String(body.negotiationId ?? ""));
    if (!negotiation) return fail(`negosiasi ${String(body.negotiationId ?? "")} tidak ditemukan`, 404);
    const service = findService(negotiation.serviceId);
    if (!service) return fail(`jasa ${negotiation.serviceId} tidak ada di katalog`);
    if (typeof body.chainId !== "number" || typeof body.tokenAddress !== "string") {
      return fail("chainId (angka) dan tokenAddress wajib diisi");
    }
    let mandate: CartMandate;
    try {
      mandate = buildCartMandate({
        negotiation,
        cart: cartForService(service, agreedTerms(negotiation).price),
        chain: typeof body.chain === "string" ? body.chain : "hashkey-testnet",
        token: typeof body.token === "string" ? body.token : "USDC",
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "mandate tidak bisa dibuat");
    }
    const tokenAddress = body.tokenAddress as Address;
    return NextResponse.json({
      ok: true,
      mandate,
      domain: cartMandateDomain(body.chainId, tokenAddress),
      types: CART_MANDATE_TYPES,
      mandateHash: cartMandateHash(body.chainId, tokenAddress, mandate),
    });
  }

  if (body.action === "verify") {
    if (typeof body.chainId !== "number" || typeof body.tokenAddress !== "string") {
      return fail("chainId (angka) dan tokenAddress wajib diisi");
    }
    const result = await verifyMandateForSettle({
      chainId: body.chainId,
      tokenAddress: body.tokenAddress as Address,
      mandate: body.mandate as CartMandate,
      signature: body.signature as Hex,
      expectedPayer: body.expectedPayer as Address,
      store: store.mandates,
      ledger: store.ledger,
      caps: store.caps,
    });
    return NextResponse.json(result);
  }

  if (body.action === "revoke") {
    const revoked = store.mandates.revoke(String(body.nonce ?? ""));
    if (!revoked) return fail(`mandate dengan nonce ${String(body.nonce ?? "")} tidak ditemukan`, 404);
    return NextResponse.json({ ok: true, revoked: true });
  }

  return fail('action tidak dikenal — pakai "create", "verify", atau "revoke"');
}
