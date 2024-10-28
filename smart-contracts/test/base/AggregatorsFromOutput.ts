/* eslint-disable import/no-extraneous-dependencies */
/**
 * This file tests all the possible combinations of:
 * TOKEN => ETH
 * TOKEN => TOKEN
 * ETH => TOKEN
 *
 * through 0x
 *
 * with no fees
 *
 * based on the output amount
 *
 */
import path from "path";
import { expect } from "chai";
import { network } from "hardhat";
import { Sources } from "../types";
import {
  DAI_ADDRESS,
  ETH_ADDRESS,
  getQuoteFromFile,
  init,
  Logger,
  showGasUsage,
  WETH_ADDRESS,
} from "../utils";
import { Address, formatEther, parseEther, zeroAddress } from "viem";
import hre from "hardhat";

const TESTDATA_DIR = path.resolve(__dirname, "testdata/output");

describe("RainbowRouter Aggregators", function () {
  let swapWETHtoDAIFromOutput: any,
    swapDAItoWETHFromOutput: any,
    swapETHtoDAIFromOutput: any,
    swapDAItoETHFromOutput: any,
    currentVaultAddress: Address;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            blockNumber: 15214922,
            jsonRpcUrl: process.env.MAINNET_RPC_ENDPOINT,
          },
        },
      ],
    });

    const {
      signer,
      wethContract,
      daiContract,
      rainbowRouterInstance,
      publicClient,
      getSignerBalance,
    } = await init();
    currentVaultAddress = rainbowRouterInstance.address;

    // FROM OUTPUT
    swapWETHtoDAIFromOutput = async (
      source: Sources,
      buyAmount: bigint,
      feePercentageBasisPoints: bigint,
    ) => {
      const buyAmountWei = parseEther(buyAmount.toString());

      Logger.log("Output amount", formatEther(buyAmountWei), "DAI");

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        "output",
        WETH_ADDRESS,
        DAI_ADDRESS,
        buyAmountWei.toString(),
        feePercentageBasisPoints.toString(),
      );
      if (!quote) return;

      Logger.log(
        `User will get ~ `,
        formatEther(quote.buyAmount),
        "DAI from ",
        formatEther(quote.sellAmount),
        "WETH",
      );

      const amountToWrapWei = parseEther("0.1");

      Logger.log(
        `User wrapping ${amountToWrapWei} into WETH to have input token available...`,
      );
      const depositTx = await wethContract.write.deposit({
        value: amountToWrapWei,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositTx });

      const initialWethBalance = await wethContract.read.balanceOf([
        signer.account.address,
      ]);
      const initialDaiBalance = await daiContract.read.balanceOf([
        signer.account.address,
      ]);

      Logger.log("Initial user WETH balance", formatEther(initialWethBalance));
      Logger.log(
        "Initial user balance (DAI): ",
        formatEther(initialDaiBalance),
      );

      // Grant the contact an allowance to spend our WETH.
      const approveTx = await wethContract.write.approve([
        rainbowRouterInstance.address,
        amountToWrapWei,
      ]);

      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      Logger.log(`Approved token allowance of `, amountToWrapWei.toString());

      Logger.log(`Executing swap...`, JSON.stringify(quote, null, 2));

      const swapTx = await rainbowRouterInstance.write.fillQuoteTokenToToken(
        [
          quote.sellTokenAddress,
          quote.buyTokenAddress,
          quote.to || "0x",
          quote.data || "0x",
          quote.sellAmount,
          quote.fee,
          {
            verifyingSigner: zeroAddress,
            nonce: 0n,
            signature: "0x",
            validBefore: 0,
            validAfter: 0,
          },
        ],
        {
          value: quote.value,
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: swapTx,
      });

      showGasUsage &&
        Logger.info("      ⛽  Gas usage: ", receipt.gasUsed.toString());

      const daiBalanceSigner = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      Logger.log("Final user balance (DAI): ", formatEther(daiBalanceSigner));

      const wethBalanceSigner = await wethContract.read.balanceOf([
        signer.account.address,
      ]);
      Logger.log("Final user balance (WETH): ", formatEther(wethBalanceSigner));

      expect(daiBalanceSigner > initialDaiBalance).to.be.equal(true);
      expect(wethBalanceSigner < initialWethBalance).to.be.equal(true);
      return true;
    };

    swapDAItoWETHFromOutput = async (
      source: Sources,
      buyAmount: bigint,
      feePercentageBasisPoints: bigint,
    ) => {
      const initialWethBalance = await wethContract.read.balanceOf([
        signer.account.address,
      ]);
      const initialDaiBalance = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      Logger.log(
        "Initial user balance (DAI): ",
        formatEther(initialDaiBalance),
      );
      Logger.log(
        "Initial user balance (WETH)",
        formatEther(initialWethBalance),
      );

      const buyAmountWei = parseEther("0.01");

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        "output",
        DAI_ADDRESS,
        WETH_ADDRESS,
        buyAmountWei.toString(),
        feePercentageBasisPoints.toString(),
      );
      if (!quote) return;

      Logger.log("Output amount", formatEther(buyAmountWei), "WETH");

      Logger.log("Amount to be swapped", formatEther(quote.sellAmount), "DAI");

      Logger.log(`User will get ~ `, formatEther(quote.buyAmount), "WETH");

      // Grant the allowance target an allowance to spend our DAI.
      const approveTx = await daiContract.write.approve([
        rainbowRouterInstance.address,
        initialDaiBalance,
      ]);

      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      Logger.log(`Executing swap...`);
      const swapTx = await rainbowRouterInstance.write.fillQuoteTokenToToken(
        [
          quote.sellTokenAddress,
          quote.buyTokenAddress,
          quote.to || "0x",
          quote.data || "0x",
          quote.sellAmount,
          quote.fee,
          {
            verifyingSigner: zeroAddress,
            nonce: 0n,
            signature: "0x",
            validBefore: 0,
            validAfter: 0,
          },
        ],
        {
          value: quote.value,
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: swapTx,
      });
      showGasUsage &&
        Logger.info("      ⛽  Gas usage: ", receipt.gasUsed.toString());

      const daiBalanceSigner = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      const wethBalanceSigner = await wethContract.read.balanceOf([
        signer.account.address,
      ]);
      const daiBalanceVault = await daiContract.read.balanceOf([
        currentVaultAddress,
      ]);

      Logger.log("Final user balance (DAI): ", formatEther(daiBalanceSigner));
      Logger.log("Final user balance (WETH): ", formatEther(wethBalanceSigner));
      Logger.log("Final VAULT balance (DAI): ", formatEther(daiBalanceVault));

      expect(daiBalanceSigner < initialDaiBalance).to.be.equal(true);
      expect(wethBalanceSigner > initialWethBalance).to.be.equal(true);
      expect(daiBalanceVault >= quote.fee).to.be.equal(true);
    };

    swapETHtoDAIFromOutput = async (
      source: Sources,
      buyAmount: bigint,
      feePercentageBasisPoints: bigint,
    ) => {
      const buyAmountWei = parseEther(buyAmount.toString());

      Logger.log("Output amount", formatEther(buyAmountWei), "DAI");

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        "output",
        ETH_ADDRESS,
        DAI_ADDRESS,
        buyAmountWei.toString(),
        feePercentageBasisPoints.toString(),
      );
      if (!quote) return;

      Logger.log(
        `User will get ~ `,
        formatEther(quote.buyAmount),
        "DAI from ",
        formatEther(quote.sellAmount),
        "ETH",
      );

      const initialEthBalance = await getSignerBalance();
      const initialDaiBalance = await daiContract.read.balanceOf([
        signer.account.address,
      ]);

      Logger.log("Initial user ETH balance", formatEther(initialEthBalance));
      Logger.log(
        "Initial user balance (DAI): ",
        formatEther(initialDaiBalance),
      );

      Logger.log(`Executing swap...`, JSON.stringify(quote, null, 2));

      const swapTx = await rainbowRouterInstance.write.fillQuoteEthToToken(
        [
          quote.buyTokenAddress,
          quote.to || "0x",
          quote.data || "0x",
          quote.fee,
          {
            verifyingSigner: zeroAddress,
            nonce: 0n,
            signature: "0x",
            validBefore: 0,
            validAfter: 0,
          },
        ],
        {
          value: quote.value,
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: swapTx,
      });

      showGasUsage &&
        Logger.info("      ⛽  Gas usage: ", receipt.gasUsed.toString());

      const daiBalanceSigner = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      Logger.log("Final user balance (DAI): ", formatEther(daiBalanceSigner));
      const ethBalanceSigner = await getSignerBalance();
      Logger.log("Final user balance (ETH): ", formatEther(ethBalanceSigner));

      expect(daiBalanceSigner > initialDaiBalance).to.be.equal(true);
      expect(ethBalanceSigner < initialEthBalance).to.be.equal(true);
      return true;
    };

    swapDAItoETHFromOutput = async (
      source: Sources,
      _: bigint,
      feePercentageBasisPoints: bigint,
    ) => {
      const initialEthBalance = await getSignerBalance();
      const initialDaiBalance = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      Logger.log(
        "Initial user balance (DAI): ",
        formatEther(initialDaiBalance),
      );
      Logger.log("Initial user balance (ETH)", formatEther(initialEthBalance));

      const buyAmountWei = parseEther("0.01");

      const quote = await getQuoteFromFile(
        TESTDATA_DIR,
        source,
        "output",
        DAI_ADDRESS,
        ETH_ADDRESS,
        buyAmountWei.toString(),
        feePercentageBasisPoints.toString(),
      );
      if (!quote) return;

      Logger.log("Output amount", formatEther(buyAmountWei), "ETH");

      Logger.log("Amount to be swapped", formatEther(quote.sellAmount), "DAI");

      Logger.log(`User will get ~ `, formatEther(quote.buyAmount), "ETH");

      // Grant the allowance target an allowance to spend our DAI.
      const approveTx = await daiContract.write.approve([
        rainbowRouterInstance.address,
        initialDaiBalance,
      ]);

      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      Logger.log(`Executing swap...`);
      const swapTx = await rainbowRouterInstance.write.fillQuoteTokenToEth(
        [
          quote.sellTokenAddress,
          quote.to || "0x",
          quote.data || "0x",
          quote.sellAmount,
          BigInt(quote.feePercentageBasisPoints),
          {
            verifyingSigner: zeroAddress,
            nonce: 0n,
            signature: "0x",
            validBefore: 0,
            validAfter: 0,
          },
        ],
        {
          value: quote.value,
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: swapTx,
      });

      showGasUsage &&
        Logger.info("      ⛽  Gas usage: ", receipt.gasUsed.toString());

      const daiBalanceSigner = await daiContract.read.balanceOf([
        signer.account.address,
      ]);
      const ethBalanceSigner = await getSignerBalance();
      const daiBalanceVault = await daiContract.read.balanceOf([
        currentVaultAddress,
      ]);

      Logger.log("Final user balance (DAI): ", formatEther(daiBalanceSigner));
      Logger.log("Final user balance (ETH): ", formatEther(ethBalanceSigner));
      Logger.log("Final VAULT balance (DAI): ", formatEther(daiBalanceVault));

      expect(daiBalanceSigner < initialDaiBalance).to.be.equal(true);
      expect(daiBalanceVault >= quote.fee).to.be.equal(true);
    };
  });

  describe("Trades based on output amount instead of input", function () {
    // ====>  0x trades
    it("Should be able to swap wETH to DAI with no fee on 0x (FROM OUTPUT)", async function () {
      return swapWETHtoDAIFromOutput("0x", "100", 0);
    });

    it("Should be able to swap DAI to WETH with no fee on 0x (FROM OUTPUT)", async function () {
      return swapDAItoWETHFromOutput("0x", null, 0);
    });

    it("Should be able to swap ETH to DAI with no fee on 0x (FROM OUTPUT)", async function () {
      return swapETHtoDAIFromOutput("0x", "100", 0);
    });

    it("Should be able to swap DAI to ETH with no fee on 0x (FROM OUTPUT)", async function () {
      return swapDAItoETHFromOutput("0x", null, 0);
    });
  });
});
