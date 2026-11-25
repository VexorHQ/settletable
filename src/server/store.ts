// Satu tempat untuk state server yang hidup di memori (PLAN.md §5: tanpa
// database — state demo disimpan lokal server). Route API berbagi store
// ini; skrip demo membuat store-nya sendiri supaya tidak tergantung env.
//
// Chain client di sini cuma untuk HSK testnet (133). Mainnet belum dipakai
// — deploy mainnet itu milestone hari ke-6 dan butuh keputusan Junes.

import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type Account } from "viem/accounts";
import { SpendLedger, usdc, type SpendCaps } from "../lib/mandate";
import { MandateStore } from "./mandates";
import type { Negotiation } from "./negotiate";

export const DEMO_CAPS: SpendCaps = { perTxCap: usdc("0.50"), dailyCap: usdc("5.00") };

export const hskTestnetChain = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://testnet-explorer.hskchain.net" } },
});

export class SettleTableStore {
  readonly ledger = new SpendLedger();
  readonly mandates = new MandateStore();
  readonly negotiations = new Map<string, Negotiation>();

  constructor(readonly caps: SpendCaps = DEMO_CAPS) {}
}

let shared: SettleTableStore | undefined;

/** Singleton untuk route API (satu proses Next.js = satu store). */
export function getStore(): SettleTableStore {
  if (!shared) shared = new SettleTableStore();
  return shared;
}

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  tokenAddress: Address;
  registryAddress: Address;
}

/** Config chain dari .env — melempar error yang jelas bila belum diisi. */
export function chainConfigFromEnv(): ChainConfig {
  const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS_TESTNET;
  const registryAddress = process.env.RECEIPT_REGISTRY_TESTNET;
  if (!tokenAddress) {
    throw new Error("PAYMENT_TOKEN_ADDRESS_TESTNET belum diisi di .env");
  }
  if (!registryAddress) {
    throw new Error("RECEIPT_REGISTRY_TESTNET belum diisi di .env — deploy dulu ke testnet");
  }
  return {
    chainId: hskTestnetChain.id,
    rpcUrl: process.env.HSK_TESTNET_RPC ?? hskTestnetChain.rpcUrls.default.http[0],
    tokenAddress: tokenAddress as Address,
    registryAddress: registryAddress as Address,
  };
}

export function chainClients(config: ChainConfig): { publicClient: PublicClient; walletClient: WalletClient } {
  const publicClient = createPublicClient({ chain: hskTestnetChain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain: hskTestnetChain, transport: http(config.rpcUrl) });
  return { publicClient, walletClient };
}

/** Executor = deployer (akun server yang mengirim transaksi + bayar gas). */
export function executorFromEnv(): Account {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    throw new Error("DEPLOYER_PRIVATE_KEY belum diisi di .env — executor belum bisa kirim transaksi");
  }
  return privateKeyToAccount(key as Hex);
}
