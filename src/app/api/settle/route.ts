// POST /api/settle — eksekusi pembayaran.
// Body: { mandate, signature, payer, auth, paymentId, memo }
//   mandate   : Cart Mandate (sudah ditandatangani pembeli)
//   signature : tanda tangan EIP-712 mandate
//   auth      : otorisasi EIP-3009 yang sudah ditandatangani pembeli
//               { from, to, value, validAfter, validBefore, nonce, v, r, s }
//               — server TIDAK menandatangani atas nama pembeli; pembeli
//               yang menandatangani di wallet-nya (pola x402).
//   paymentId : bytes32, id unik pembayaran (dipakai juga sebagai nonce auth)
//   memo      : baris deskripsi receipt, mis. "Ringkasan riset 5 sumber — 1 item"
//
// Butuh .env: PAYMENT_TOKEN_ADDRESS_TESTNET, RECEIPT_REGISTRY_TESTNET,
// DEPLOYER_PRIVATE_KEY (executor), HSK_TESTNET_RPC (opsional).
// Bila belum dikonfigurasi, jawab 503 — jangan pura-pura berhasil.

import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import type { CartMandate } from "../../../lib/mandate";
import { executeSettle, type TransferAuth } from "../../../server/settle";
import { chainClients, chainConfigFromEnv, executorFromEnv, getStore, hskTestnetChain } from "../../../server/store";

export async function POST(req: Request) {
  let config;
  try {
    config = chainConfigFromEnv();
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "settlement belum dikonfigurasi" },
      { status: 503 },
    );
  }
  let executor;
  try {
    executor = executorFromEnv();
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "executor belum dikonfigurasi" },
      { status: 503 },
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const auth = body.auth as Record<string, unknown>;
  if (!body.mandate || !body.signature || !body.payer || !auth || !body.paymentId) {
    return NextResponse.json(
      { ok: false, reason: "mandate, signature, payer, auth, dan paymentId wajib diisi" },
      { status: 400 },
    );
  }

  const store = getStore();
  const { publicClient, walletClient } = chainClients(config);
  const result = await executeSettle(
    {
      publicClient,
      walletClient,
      executor,
      chain: hskTestnetChain,
      tokenAddress: config.tokenAddress,
      registryAddress: config.registryAddress,
      chainId: config.chainId,
      ledger: store.ledger,
      store: store.mandates,
      caps: store.caps,
    },
    {
      mandate: body.mandate as CartMandate,
      signature: body.signature as Hex,
      payer: body.payer as Address,
      auth: {
        from: auth.from as Address,
        to: auth.to as Address,
        value: BigInt(String(auth.value)),
        validAfter: BigInt(String(auth.validAfter)),
        validBefore: BigInt(String(auth.validBefore)),
        nonce: auth.nonce as Hex,
        v: Number(auth.v),
        r: auth.r as Hex,
        s: auth.s as Hex,
      } satisfies TransferAuth,
      paymentId: body.paymentId as Hex,
      memo: typeof body.memo === "string" ? body.memo : "",
    },
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    paymentId: result.paymentId,
    txHash: result.txHash,
    receiptTxHash: result.receiptTxHash,
    mandateHash: result.mandateHash,
    amount: result.amount.toString(),
    receiptText: result.receiptText,
  });
}
