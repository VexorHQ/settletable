import { HardhatUserConfig } from "hardhat/config";

// Jaringan HSK Chain — data dari chainid.network (lihat RESEARCH.md).
// RPC default = endpoint publik; timpa lewat .env bila perlu.
// DEPLOYER_PRIVATE_KEY hanya dibaca dari environment, jangan tulis di file ini.
const deployer = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hskTestnet: {
      chainId: 133,
      url: process.env.HSK_TESTNET_RPC ?? "https://testnet.hsk.xyz",
      accounts: deployer,
    },
    hskMainnet: {
      chainId: 177,
      url: process.env.HSK_MAINNET_RPC ?? "https://mainnet.hsk.xyz",
      accounts: deployer,
    },
  },
};

export default config;
