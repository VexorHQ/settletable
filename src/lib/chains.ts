// Konfigurasi jaringan HSK Chain — data, bukan logika.
// Sumber: chainid.network/chains.json (chain 177 + 133), dicek 25 Nov 2026.
// Kalau RPC/explorer berubah, yang diubah cuma file ini.

export interface HskChain {
  chainId: number;
  name: string;
  shortName: string;
  rpc: string;
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const HSK_TESTNET: HskChain = {
  chainId: 133,
  name: "HSKChain Testnet",
  shortName: "HSKT",
  rpc: "https://testnet.hsk.xyz",
  explorer: "https://testnet-explorer.hskchain.net",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
};

export const HSK_MAINNET: HskChain = {
  chainId: 177,
  name: "HSKChain",
  shortName: "hsk",
  rpc: "https://mainnet.hsk.xyz",
  explorer: "https://hsk.blockscout.com",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
};

export const HSK_CHAINS: Record<number, HskChain> = {
  [HSK_TESTNET.chainId]: HSK_TESTNET,
  [HSK_MAINNET.chainId]: HSK_MAINNET,
};

/** CAIP-2 network id, dipakai di payment terms x402 (mis. "eip155:133"). */
export function caip2(chainId: number): string {
  return `eip155:${chainId}`;
}
