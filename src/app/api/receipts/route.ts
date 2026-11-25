// GET /api/receipts — baca receipt dari kontrak (tanpa kunci, tanpa tulis).
//   ?paymentId=0x...  -> satu receipt + teks dokumennya
//   ?payer=0x...      -> semua receipt yang dibayar alamat itu
//   ?payee=0x...      -> semua receipt yang diterima alamat itu
// Butuh .env: RECEIPT_REGISTRY_TESTNET (dan PAYMENT_TOKEN_ADDRESS_TESTNET
// untuk chainConfigFromEnv). Bila belum dikonfigurasi, jawab 503.

import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { listReceiptsOfPayee, listReceiptsOfPayer, readReceipt } from "../../../server/receipts";
import { chainClients, chainConfigFromEnv } from "../../../server/store";

export async function GET(req: Request) {
  let config;
  try {
    config = chainConfigFromEnv();
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "receipt belum dikonfigurasi" },
      { status: 503 },
    );
  }
  const { publicClient } = chainClients(config);
  const params = new URL(req.url).searchParams;
  const paymentId = params.get("paymentId");
  const payer = params.get("payer");
  const payee = params.get("payee");

  try {
    if (paymentId) {
      const { receipt, text } = await readReceipt(publicClient, config.registryAddress, paymentId as Hex);
      return NextResponse.json({ ok: true, receipt: serialize(receipt), receiptText: text });
    }
    if (payer) {
      const receipts = await listReceiptsOfPayer(publicClient, config.registryAddress, payer as Address);
      return NextResponse.json({ ok: true, receipts: receipts.map(serialize) });
    }
    if (payee) {
      const receipts = await listReceiptsOfPayee(publicClient, config.registryAddress, payee as Address);
      return NextResponse.json({ ok: true, receipts: receipts.map(serialize) });
    }
    return NextResponse.json(
      { ok: false, reason: "isi salah satu: paymentId, payer, atau payee" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "receipt tidak bisa dibaca" },
      { status: 404 },
    );
  }
}

function serialize(receipt: {
  paymentId: Hex;
  payer: Address;
  payee: Address;
  token: Address;
  amount: bigint;
  mandateHash: Hex;
  txHash: Hex;
  recordedAt: bigint;
  memo: string;
}) {
  return {
    ...receipt,
    amount: receipt.amount.toString(),
    recordedAt: receipt.recordedAt.toString(),
  };
}
