import { describe, expect, it } from "vitest";
import { caip2, HSK_CHAINS, HSK_MAINNET, HSK_TESTNET } from "../src/lib/chains";

// Smoke test: config jaringan sesuai data chainid.network (25 Nov 2026).
// Kalau RPC/explorer resmi berubah, ubah src/lib/chains.ts DAN test ini.
describe("konfigurasi jaringan HSK Chain", () => {
  it("testnet chain 133", () => {
    expect(HSK_TESTNET.chainId).toBe(133);
    expect(HSK_TESTNET.rpc).toBe("https://testnet.hsk.xyz");
    expect(HSK_TESTNET.explorer).toBe("https://testnet-explorer.hskchain.net");
    expect(HSK_TESTNET.nativeCurrency.symbol).toBe("HSK");
    expect(caip2(HSK_TESTNET.chainId)).toBe("eip155:133");
  });

  it("mainnet chain 177", () => {
    expect(HSK_MAINNET.chainId).toBe(177);
    expect(HSK_MAINNET.rpc).toBe("https://mainnet.hsk.xyz");
    expect(HSK_MAINNET.explorer).toBe("https://hsk.blockscout.com");
    expect(HSK_MAINNET.nativeCurrency.symbol).toBe("HSK");
    expect(caip2(HSK_MAINNET.chainId)).toBe("eip155:177");
  });

  it("lookup per chainId", () => {
    expect(HSK_CHAINS[133]).toBe(HSK_TESTNET);
    expect(HSK_CHAINS[177]).toBe(HSK_MAINNET);
  });
});
