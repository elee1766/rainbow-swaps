import { HardhatUserConfig, task } from 'hardhat/config';
import "@nomicfoundation/hardhat-toolbox-viem";
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.viem.getWalletClients();

  for (const account of accounts) {
    // eslint-disable-next-line no-console
    console.log(await account.getAddresses());
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: 'USD',
  },
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        blockNumber: 15214922,
        url: process.env.MAINNET_RPC_ENDPOINT|| "",
      },
    },
    mainnet: {
      // accounts: [process.env.RAINBOW_DEPLOYMENT_PKEY],
      url: process.env.MAINNET_RPC_ENDPOINT,
    },
  },
  solidity: {
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
    version: '0.8.27',
  },
};

export default  config
