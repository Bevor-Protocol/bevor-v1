import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true
        }
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: "wasp cinnamon scissors pepper push battle danger similar axis occur behind turn",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    hardhat: {
      accounts: {
        mnemonic: "wasp cinnamon scissors pepper push battle danger similar axis occur behind turn",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    }
  },
};

export default config;
