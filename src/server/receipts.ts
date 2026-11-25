// Baca receipt dari kontrak — tanpa kunci, tanpa tulis.
// Dipakai dashboard (hari ke-4) dan route /api/receipts. Client yang
// diterima di sini cuma butuh readContract, supaya gampang dites dengan
// stub di vitest.

import { type Address, type Hex, type PublicClient, parseAbi } from "viem";

const REGISTRY_ABI = parseAbi([
  "function getReceipt(bytes32 paymentId) view returns ((bytes32 paymentId, address payer, address payee, address token, uint256 amount, bytes32 mandateHash, bytes32 txHash, uint256 recordedAt, string memo))",
  "function receiptText(bytes32 paymentId) view returns (string)",
  "function receiptCount() view returns (uint256)",
  "function receiptsOfPayer(address payer) view returns ((bytes32 paymentId, address payer, address payee, address token, uint256 amount, bytes32 mandateHash, bytes32 txHash, uint256 recordedAt, string memo)[])",
  "function receiptsOfPayee(address payee) view returns ((bytes32 paymentId, address payer, address payee, address token, uint256 amount, bytes32 mandateHash, bytes32 txHash, uint256 recordedAt, string memo)[])",
]);

export interface OnChainReceipt {
  paymentId: Hex;
  payer: Address;
  payee: Address;
  token: Address;
  amount: bigint;
  mandateHash: Hex;
  txHash: Hex;
  recordedAt: bigint;
  memo: string;
}

type ReceiptReader = Pick<PublicClient, "readContract">;

function toReceipt(raw: unknown): OnChainReceipt {
  const receipt = raw as OnChainReceipt;
  return {
    paymentId: receipt.paymentId,
    payer: receipt.payer,
    payee: receipt.payee,
    token: receipt.token,
    amount: BigInt(receipt.amount),
    mandateHash: receipt.mandateHash,
    txHash: receipt.txHash,
    recordedAt: BigInt(receipt.recordedAt),
    memo: receipt.memo,
  };
}

export async function readReceipt(
  client: ReceiptReader,
  registryAddress: Address,
  paymentId: Hex,
): Promise<{ receipt: OnChainReceipt; text: string }> {
  const raw = await client.readContract({
    abi: REGISTRY_ABI,
    address: registryAddress,
    functionName: "getReceipt",
    args: [paymentId],
  });
  const text = await client.readContract({
    abi: REGISTRY_ABI,
    address: registryAddress,
    functionName: "receiptText",
    args: [paymentId],
  });
  return { receipt: toReceipt(raw), text };
}

export async function listReceiptsOfPayer(
  client: ReceiptReader,
  registryAddress: Address,
  payer: Address,
): Promise<OnChainReceipt[]> {
  const raw = await client.readContract({
    abi: REGISTRY_ABI,
    address: registryAddress,
    functionName: "receiptsOfPayer",
    args: [payer],
  });
  return (raw as unknown[]).map(toReceipt);
}

export async function listReceiptsOfPayee(
  client: ReceiptReader,
  registryAddress: Address,
  payee: Address,
): Promise<OnChainReceipt[]> {
  const raw = await client.readContract({
    abi: REGISTRY_ABI,
    address: registryAddress,
    functionName: "receiptsOfPayee",
    args: [payee],
  });
  return (raw as unknown[]).map(toReceipt);
}

export async function receiptCount(client: ReceiptReader, registryAddress: Address): Promise<bigint> {
  return client.readContract({
    abi: REGISTRY_ABI,
    address: registryAddress,
    functionName: "receiptCount",
    args: [],
  });
}
