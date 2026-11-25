// Satu-satunya modul yang menyentuh uang (PLAN.md §4) — bersama kontrak.
// Jalur fallback EIP-3009: pembeli menandatangani mandate + otorisasi
// transfer; server (executor) yang mengirim kedua transaksi dan membayar
// gas. Adapter HSP (hari ke-5) akan mengimplementasikan interface yang
// sama — verify + settle — tanpa mengubah modul lain.
//
// Urutan di executeSettle disengaja: semua cek dulu, transfer, receipt,
// baru ledger dicatat. Bila transfer berhasil tapi receipt gagal, lempar
// error keras — jangan pura-pura gagal total, uang sudah berpindah dan itu
// perlu rekonsiliasi (jalur itu: hari ke-4).

import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  getAddress,
  parseAbi,
  parseSignature,
  recoverTypedDataAddress,
} from "viem";
import {
  type SpendCaps,
  type SpendLedger,
  cartMandateAmount,
  cartMandateHash,
  formatUsdc,
  type CapCheck,
  type CartMandate,
} from "../lib/mandate";
import { verifyMandateForSettle, type MandateStore } from "./mandates";

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ABI minimal — cukup untuk settle + baca receipt. ABI lengkap ada di
// artifacts Hardhat; modul server tidak bergantung pada file build itu.
const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

const REGISTRY_ABI = parseAbi([
  "function exists(bytes32 paymentId) view returns (bool)",
  "function recordReceipt(bytes32 paymentId, address payer, address payee, address token, uint256 amount, bytes32 mandateHash, bytes32 txHash, string memo)",
  "function receiptText(bytes32 paymentId) view returns (string)",
]);

export function transferAuthDomain(tokenName: string, chainId: number, tokenAddress: Address) {
  return {
    name: tokenName,
    version: "1",
    chainId,
    verifyingContract: tokenAddress,
  } as const;
}

export interface TransferAuth {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex; // bytes32 — di Lunas dipakai paymentId, satu otorisasi per pembayaran
  v: number;
  r: Hex;
  s: Hex;
}

type TransferAuthMessage = Omit<TransferAuth, "v" | "r" | "s">;

function authMessage(auth: TransferAuth): TransferAuthMessage {
  return {
    from: auth.from,
    to: auth.to,
    value: auth.value,
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce,
  };
}

/** Susun tanda tangan 65 byte dari bagian-bagiannya. */
export function authSignatureHex(auth: TransferAuth): Hex {
  return `0x${auth.r.slice(2)}${auth.s.slice(2)}${auth.v.toString(16).padStart(2, "0")}` as Hex;
}

/** Pembeli menandatangani otorisasi EIP-3009 untuk satu pembayaran. */
export async function signTransferAuthorization(
  payer: Account,
  tokenName: string,
  chainId: number,
  tokenAddress: Address,
  auth: TransferAuthMessage,
): Promise<TransferAuth> {
  if (!payer.signTypedData) throw new Error("akun ini tidak bisa menandatangani typed data");
  const signature = await payer.signTypedData({
    domain: transferAuthDomain(tokenName, chainId, tokenAddress),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: auth,
  });
  const { v, r, s } = parseSignature(signature);
  return { ...auth, v: Number(v), r, s };
}

/** Pulihkan penandatangan otorisasi — gagal cepat sebelum gas terbuang. */
export async function recoverTransferAuthorizationSigner(
  tokenName: string,
  chainId: number,
  tokenAddress: Address,
  auth: TransferAuthMessage,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: transferAuthDomain(tokenName, chainId, tokenAddress),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: auth,
    signature,
  });
}

export interface SettleRequest {
  mandate: CartMandate;
  signature: Hex;
  payer: Address;
  auth: TransferAuth;
  paymentId: Hex;
  memo: string;
}

export interface SettleDeps {
  publicClient: PublicClient;
  walletClient: WalletClient;
  executor: Account; // yang mengirim transaksi + membayar gas
  chain: Chain; // chain tempat transaksi dikirim (walletClient dibuat tanpa chain)
  tokenAddress: Address;
  registryAddress: Address;
  chainId: number;
  ledger: SpendLedger;
  store: MandateStore;
  caps: SpendCaps;
}

export type SettleResult =
  | {
      ok: true;
      paymentId: Hex;
      txHash: Hex;
      receiptTxHash: Hex;
      mandateHash: Hex;
      receiptText: string;
      amount: bigint;
    }
  | { ok: false; reason: string };

export async function executeSettle(deps: SettleDeps, req: SettleRequest): Promise<SettleResult> {
  const amount = cartMandateAmount(req.mandate);
  const mandateHash = cartMandateHash(deps.chainId, deps.tokenAddress, req.mandate);

  // 1. Semua cek sebelum uang bergerak (tanda tangan, kedaluwarsa, cabut,
  //    nonce, cap). Bila gagal di sini, tidak ada transaksi sama sekali.
  const pre: CapCheck = await verifyMandateForSettle({
    chainId: deps.chainId,
    tokenAddress: deps.tokenAddress,
    mandate: req.mandate,
    signature: req.signature,
    expectedPayer: req.payer,
    store: deps.store,
    ledger: deps.ledger,
    caps: deps.caps,
  });
  if (!pre.ok) return pre;

  // 2. Otorisasi transfer harus cocok dengan mandate — jumlah, penerima,
  //    dan penandatangan yang sama. Kalau tidak cocok, ini mandate yang
  //    diutak-atik setelah ditandatangani.
  if (getAddress(req.auth.from) !== getAddress(req.payer)) {
    return { ok: false, reason: "otorisasi transfer bukan dari pembeli" };
  }
  if (getAddress(req.auth.to) !== getAddress(req.mandate.payee)) {
    return { ok: false, reason: "otorisasi transfer bukan ke penjual di mandate" };
  }
  if (req.auth.value !== amount) {
    return {
      ok: false,
      reason: `otorisasi ${formatUsdc(req.auth.value)} USDC tidak sama dengan mandate ${formatUsdc(amount)} USDC`,
    };
  }
  const alreadyRecorded = await deps.publicClient.readContract({
    abi: REGISTRY_ABI,
    address: deps.registryAddress,
    functionName: "exists",
    args: [req.paymentId],
  });
  if (alreadyRecorded) {
    return { ok: false, reason: `paymentId ${req.paymentId} sudah tercatat` };
  }

  // 3. Nama token dibaca dari kontrak (jangan hardcode — alur ini agnostik
  //    token, ganti alamat token cukup ganti config).
  const tokenName = await deps.publicClient.readContract({
    abi: TOKEN_ABI,
    address: deps.tokenAddress,
    functionName: "name",
  });
  const authSigner = await recoverTransferAuthorizationSigner(
    tokenName,
    deps.chainId,
    deps.tokenAddress,
    authMessage(req.auth),
    authSignatureHex(req.auth),
  );
  if (getAddress(authSigner) !== getAddress(req.payer)) {
    return { ok: false, reason: "tanda tangan otorisasi transfer tidak cocok dengan pembeli" };
  }

  // 4. Executor mengirim transferWithAuthorization (gas ditanggung executor).
  const txHash = await deps.walletClient.writeContract({
    abi: TOKEN_ABI,
    address: deps.tokenAddress,
    functionName: "transferWithAuthorization",
    account: deps.executor,
    chain: deps.chain,
    args: [
      req.auth.from,
      req.auth.to,
      req.auth.value,
      req.auth.validAfter,
      req.auth.validBefore,
      req.auth.nonce,
      req.auth.v,
      req.auth.r,
      req.auth.s,
    ],
  });
  const transferReceipt = await deps.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (transferReceipt.status !== "success") {
    return { ok: false, reason: `transfer on-chain gagal (tx ${txHash})` };
  }

  // 5. Receipt dicatat. Bila ini gagal SETELAH transfer, lempar error —
  //    uang sudah berpindah tapi bukti belum tercatat.
  const receiptTxHash = await deps.walletClient.writeContract({
    abi: REGISTRY_ABI,
    address: deps.registryAddress,
    functionName: "recordReceipt",
    account: deps.executor,
    chain: deps.chain,
    args: [req.paymentId, req.payer, req.mandate.payee, deps.tokenAddress, amount, mandateHash, txHash, req.memo],
  });
  const receiptReceipt = await deps.publicClient.waitForTransactionReceipt({ hash: receiptTxHash });
  if (receiptReceipt.status !== "success") {
    throw new Error(
      `transfer ${txHash} berhasil tapi recordReceipt gagal (tx ${receiptTxHash}) — perlu rekonsiliasi manual`,
    );
  }

  // 6. Baru sekarang ledger dicatat — uang dan receipt sama-sama sudah ada.
  const recorded = deps.ledger.record(req.payer, amount, req.mandate.nonce, deps.caps);
  if (!recorded.ok) {
    throw new Error(`transfer + receipt berhasil tapi ledger menolak: ${recorded.reason} — perlu rekonsiliasi manual`);
  }

  const receiptText = await deps.publicClient.readContract({
    abi: REGISTRY_ABI,
    address: deps.registryAddress,
    functionName: "receiptText",
    args: [req.paymentId],
  });
  return { ok: true, paymentId: req.paymentId, txHash, receiptTxHash, mandateHash, receiptText, amount };
}
