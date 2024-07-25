require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    // hardhat: {
    //   forking: {
    //     url: "https://eth-mainnet.g.alchemy.com/v2/LXGeb3eAxmAE7CQYYm9ncwSV7j4m7WNj",
    //   },
    //   chainId: 1,
    // },
    sepolia: {
      url: "https://1rpc.io/sepolia", // Replace with your Infura project ID
      accounts: [`0x${process.env.PRIVATE_KEY}`] // Replace with your private key
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.API_KEY
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: true
  }
};
