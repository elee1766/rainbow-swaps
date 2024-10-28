/* eslint-disable import/no-extraneous-dependencies */
/**
 * This file tests all the possible combinations of:
 * TOKEN => ETH
 * TOKEN => TOKEN
 *
 * through 1inch and 0x
 *
 * with no fees
 *
 * based on the input amount
 *
 * and using a permit signature instead of approvals
 *
 */

import path from 'path';
import { expect } from 'chai';
import { network } from 'hardhat';

import { Sources } from '../types';
import {
  BAL_ADDRESS,
  DAI_ADDRESS,
  ENS_ADDRESS,
  ETH_ADDRESS,
  FEI_ADDRESS,
  getQuoteFromFile,
  INCH_ADDRESS,
  init,
  Logger,
  LQTY_ADDRESS,
  MIST_ADDRESS,
  OPIUM_ADDRESS,
  RAD_ADDRESS,
  showGasUsage,
  signPermit,
  TORN_ADDRESS,
  TRIBE_ADDRESS,
  USDC_ADDRESS,
  VSP_ADDRESS,
  WNXM_ADDRESS,
} from '../utils';

import hre from 'hardhat';
import { Address, formatEther, formatUnits, maxUint256, parseEther } from 'viem';
const SELL_AMOUNT = '0.1';
const TESTDATA_DIR = path.resolve(__dirname, 'testdata/inputpermit');

describe('RainbowRouter Aggregators', function () {
  let swapETHtoToken: any, swapTokentoETH: any, swapTokentoToken: any;

  before(async () => {
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            blockNumber: 15214922,
            jsonRpcUrl: process.env.MAINNET_RPC_ENDPOINT,
          },
        },
      ],
    });

    const { signer, rainbowRouterInstance, publicClient } = await init();

    swapETHtoToken = async (
      source: Sources,
      tokenAddress: Address,
      sellAmount: bigint,
      feePercentageBasisPoints: bigint
    ) => {
      const tokenContract = await hre.viem.getContractAt(
        'IERC20',
        tokenAddress
      );

      const initialEthBalance = await publicClient.getBalance({address: signer.account.address});
      const initialTokenBalance = await tokenContract.read.balanceOf([signer.account.address]);
      const tokenSymbol = await tokenContract.read.symbol();
      const tokenDecimals = await tokenContract.read.decimals();
      Logger.log(
        'Initial user balance (ETH)',
        formatEther(initialEthBalance)
      );
      Logger.log(
        `Initial user balance (${tokenSymbol}): `,
        formatUnits(initialTokenBalance, tokenDecimals)
      );

      const sellAmountWei = parseEther(sellAmount.toString());

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        'input',
        ETH_ADDRESS,
        tokenContract.address,
        sellAmountWei.toString(),
        feePercentageBasisPoints.toString()
      );
      if (!quote) return;

      Logger.log(
        'Input amount',
        formatEther(sellAmountWei),
        'ETH'
      );
      Logger.log('Fee', formatEther(quote.fee), 'ETH');
      Logger.log(
        'Amount to be swapped',
        formatEther(quote.sellAmountMinusFees),
        'ETH'
      );
      Logger.log(
        `User will get ~ `,
        formatUnits(quote.buyAmount, tokenDecimals),
        tokenSymbol
      );

      Logger.log(
        `Executing swap... with `,
        formatEther(sellAmountWei)
      );

      const swapTx = await rainbowRouterInstance.write.fillQuoteEthToToken([
        quote.buyTokenAddress,
        quote.to,
        quote.data,
        quote.fee,
        ],
        {
          value: quote.value,
        }
      );

      const receipt = await swapTx.wait();
      showGasUsage &&
        Logger.info('      ⛽  Gas usage: ', receipt.gasUsed.toString());

      const tokenBalanceSigner = await tokenContract.read.balanceOf([signer.account.address]);
      const ethBalanceSigner = await publicClient.getBalance({address: signer.account.address});
      Logger.log(
        `Final user balance (${tokenSymbol}): `,
        formatUnits(tokenBalanceSigner, tokenDecimals)
      );
      Logger.log(
        'Final user balance (ETH): ',
        formatEther(ethBalanceSigner)
      );

      expect(tokenBalanceSigner.gt(initialTokenBalance)).to.be.equal(true);
      expect(ethBalanceSigner.lt(initialEthBalance)).to.be.equal(true);
    };

    swapTokentoETH = async (
      source: Sources,
      tokenAddress: Address,
      feePercentageBasisPoints: bigint,
      usePermit = true
    ) => {
      const tokenContract = await hre.viem.getContractAt(
        tokenAddress.toLowerCase() === DAI_ADDRESS.toLowerCase()
          ? 'IDAI'
          : 'IERC2612Extension',
        tokenAddress
      );
      const initialEthBalance = await publicClient.getBalance({address: signer.account.address});
      const initialTokenBalance = await tokenContract.read.balanceOf([signer.account.address]);
      const tokenSymbol = await tokenContract.read.symbol();
      const tokenDecimals = await tokenContract.read.decimals();

      Logger.log(
        `Initial user balance (${tokenSymbol}): `,
        formatUnits(initialTokenBalance, tokenDecimals)
      );
      Logger.log(
        'Initial user balance (ETH)',
        formatEther(initialEthBalance)
      );

      const sellAmountWei = initialTokenBalance;

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        'input',
        tokenContract.address,
        ETH_ADDRESS,
        sellAmountWei.toString(),
        feePercentageBasisPoints.toString()
      );
      if (!quote) return;

      Logger.log(
        'Input amount',
        formatUnits(sellAmountWei, tokenDecimals),
        tokenSymbol
      );
      Logger.log('Fee', formatEther(quote.fee), 'ETH');

      Logger.log(
        'Amount to be swapped',
        formatUnits(quote.sellAmountMinusFees),
        tokenSymbol
      );

      Logger.log(
        `User will get ~ `,
        formatEther(quote.buyAmount),
        'ETH'
      );

      let swapTx;
      if (usePermit) {
        let {timestamp} = await publicClient.getBlock()
        await hre.network.provider.send('evm_setNextBlockTimestamp', [++timestamp]);
        const deadline = timestamp + 3600n;
        const permitSignature = await signPermit(
          tokenContract,
          signer.account.address,
          rainbowRouterInstance.address,
          maxUint256,
          deadline,
          1
        );

        Logger.log(
          'PERMIT SIGNATURE',
          JSON.stringify(permitSignature, null, 2)
        );

        Logger.log(`Executing swap...`);
        swapTx = await rainbowRouterInstance.write.fillQuoteTokenToEthWithPermit([
          quote.sellTokenAddress,
          quote.to,
          quote.data,
          quote.sellAmount,
          quote.feePercentageBasisPoints,
          permitSignature,
          ],
          {
            value: quote.value,
          }
        );
      } else {
        swapTx = await rainbowRouterInstance.write.fillQuoteTokenToEth([
          quote.sellTokenAddress,
          quote.to,
          quote.data,
          quote.sellAmount,
          quote.feePercentageBasisPoints,
          ],
          {
            value: quote.value,
          }
        );
      }

      const receipt = await swapTx.wait();
      showGasUsage &&
        Logger.info('      ⛽  Gas usage: ', receipt.gasUsed.toString());

      const tokenBalanceSigner = await tokenContract.balanceOf(signer.account.address);
      const ethBalanceSigner = await signer.getBalance();

      Logger.log(
        `Final user balance (${tokenSymbol}): `,
        formatEther(tokenBalanceSigner)
      );
      Logger.log(
        'Final user balance (ETH): ',
        formatEther(ethBalanceSigner)
      );
      expect(tokenBalanceSigner).to.be.equal('0');
      expect(ethBalanceSigner.gt(initialEthBalance)).to.be.equal(true);
    };

    swapTokentoToken = async (
      source: Sources,
      tokenAddress: EthereumAddress,
      buyTokenAddress: EthereumAddress,
      feePercentageBasisPoints: bigint
    ) => {
      const tokenContract = await ethers.getContractAt(
        tokenAddress.toLowerCase() === DAI_ADDRESS.toLowerCase()
          ? 'IDAI'
          : 'IERC2612Extension',
        tokenAddress
      );

      const buyTokenContract = await ethers.getContractAt(
        buyTokenAddress.toLowerCase() === DAI_ADDRESS.toLowerCase()
          ? 'IDAI'
          : 'IERC2612Extension',
        buyTokenAddress
      );
      const initialBuyTokenBalance = await buyTokenContract.balanceOf(
        signer.account.address
      );
      const initialTokenBalance = await tokenContract.balanceOf(signer.account.address);
      const tokenSymbol = await tokenContract.symbol();
      const tokenDecimals = await tokenContract.decimals();

      const buyTokenSymbol = await buyTokenContract.symbol();
      const buyTokenDecimals = await buyTokenContract.decimals();

      Logger.log(
        `Initial user balance (${tokenSymbol}): `,
        formatUnits(initialTokenBalance, tokenDecimals)
      );
      Logger.log(
        `Initial user balance (${buyTokenSymbol}): `,
        formatUnits(initialBuyTokenBalance, buyTokenDecimals)
      );

      const sellAmountWei = initialTokenBalance;

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        'input',
        tokenContract.address,
        buyTokenContract.address,
        sellAmountWei.toString(),
        feePercentageBasisPoints.toString()
      );
      if (!quote) return;

      Logger.log(
        'Input amount',
        formatUnits(sellAmountWei, tokenDecimals),
        tokenSymbol
      );
      Logger.log(
        'Fee',
        formatUnits(quote.fee, tokenDecimals),
        tokenSymbol
      );

      Logger.log(
        'Amount to be swapped',
        formatUnits(quote.sellAmountMinusFees),
        tokenSymbol
      );

      Logger.log(
        `User will get ~ `,
        formatUnits(quote.buyAmount, buyTokenDecimals),
        buyTokenSymbol
      );

      let { timestamp } = await ethers.provider.getBlock('latest');
      await ethers.provider.send('evm_setNextBlockTimestamp', [++timestamp]);
      const deadline = timestamp + 3600;
      const permitSignature = await signPermit(
        tokenContract,
        signer.account.address,
        rainbowRouterInstance.address,
        MAX_INT,
        deadline,
        1
      );

      Logger.log('PERMIT SIGNATURE', JSON.stringify(permitSignature, null, 2));

      Logger.log(`Executing swap...`);

      const swapTx =
        await rainbowRouterInstance.fillQuoteTokenToTokenWithPermit(
          quote.sellTokenAddress,
          quote.buyTokenAddress,
          quote.to,
          quote.data,
          quote.sellAmount,
          quote.fee,
          permitSignature,
          {
            value: quote.value,
          }
        );

      const receipt = await swapTx.wait();
      showGasUsage &&
        Logger.info('      ⛽  Gas usage: ', receipt.gasUsed.toString());

      const tokenBalanceSigner = await tokenContract.balanceOf(signer.account.address);
      const buyTokenBalanceSigner = await buyTokenContract.balanceOf(
        signer.account.address
      );

      Logger.log(
        `Final user balance (${tokenSymbol}): `,
        formatEther(tokenBalanceSigner)
      );
      Logger.log(
        `Final user balance (${buyTokenSymbol}): `,
        formatEther(buyTokenBalanceSigner)
      );
      expect(tokenBalanceSigner).to.be.equal('0');
      expect(buyTokenBalanceSigner.gt(initialBuyTokenBalance)).to.be.equal(
        true
      );
    };
  });

  describe('Trades with Permit', function () {
    it('Should be able to swap DAI to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', DAI_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', DAI_ADDRESS, 0);
    });

    it('Should be able to swap DAI to ENS using permit instead of approval', async function () {
      await swapETHtoToken('0x', DAI_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoToken('0x', DAI_ADDRESS, ENS_ADDRESS, 0);
    });

    it('Should be able to swap INCH to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', INCH_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', INCH_ADDRESS, 0);
    });

    it('Should be able to swap ENS to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', ENS_ADDRESS, 1, 0);
      return swapTokentoETH('1inch', ENS_ADDRESS, 0);
    });

    it('Should be able to swap USDC to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', USDC_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', USDC_ADDRESS, 0);
    });

    it('Should be able to swap USDC to ENS using permit instead of approval', async function () {
      await swapETHtoToken('0x', USDC_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoToken('0x', USDC_ADDRESS, ENS_ADDRESS, 0);
    });

    it('Should be able to swap LQTY to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', LQTY_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', LQTY_ADDRESS, 0);
    });

    it('Should be able to swap RAD to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', RAD_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', RAD_ADDRESS, 0);
    });

    it('Should be able to swap BAL to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', BAL_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', BAL_ADDRESS, 0);
    });

    it('Should be able to swap TRIBE to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', TRIBE_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', TRIBE_ADDRESS, 0);
    });

    it('Should be able to swap MIST to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', MIST_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', MIST_ADDRESS, 0);
    });

    it('Should be able to swap OPIUM to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', OPIUM_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', OPIUM_ADDRESS, 0);
    });

    it('Should be able to swap FEI to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', FEI_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', FEI_ADDRESS, 0);
    });

    it('Should be able to swap VSP to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', VSP_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', VSP_ADDRESS, 0);
    });

    it('Should be able to swap TORN to ETH using permit instead of approval', async function () {
      await swapETHtoToken('1inch', TORN_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('1inch', TORN_ADDRESS, 0);
    });

    it('Should be able to swap WNXM to ETH using permit instead of approval', async function () {
      await swapETHtoToken('0x', WNXM_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', WNXM_ADDRESS, 0);
    });
  });

  describe('it should preserve the allowance after being set to MAX_INT', () => {
    it('Should be able to swap DAI to ETH with an existing approval via permit', async function () {
      await swapETHtoToken('0x', DAI_ADDRESS, SELL_AMOUNT, 0);
      return swapTokentoETH('0x', DAI_ADDRESS, 0, false);
    });
    it('Should be able to swap ENS to ETH with an existing approval via permit', async function () {
      await swapETHtoToken('1inch', ENS_ADDRESS, '1', 0);
      return swapTokentoETH('1inch', ENS_ADDRESS, 0, false);
    });
  });
});
