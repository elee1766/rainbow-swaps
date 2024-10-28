/* eslint-disable import/no-extraneous-dependencies */
/**
 * This file tests all the "admin" features:
 * - fee withdrawals
 * - token approvals
 */

import { expect } from "chai";
import { network } from "hardhat";
import { init, MAINNET_ADDRESS_1INCH, WETH_ADDRESS } from "../utils";
import hre from "hardhat";
import { getAddress, getContract, zeroAddress } from "viem";
type AsyncReturnType<T extends (..._args: any) => Promise<any>> = Awaited<ReturnType<T>>;

describe("Admin", function () {
  let instance: AsyncReturnType<typeof init>["rainbowRouterInstance"];
  let weth: AsyncReturnType<typeof init>["wethContract"];
  let publicClient: AsyncReturnType<typeof init>["publicClient"];

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

    let { rainbowRouterInstance, wethContract, publicClient: pc } = await init();
    instance = rainbowRouterInstance;
    weth = wethContract;
    publicClient = pc;
  });

  it("Should be able to withdraw tokens", async function () {
    // 1 - Send some tokens to the contract
    const amount = 10000000n;
    const accounts = await hre.viem.getWalletClients();
    const receiver = accounts[2];

    const depositTx = await weth.write.deposit({
      value: amount,
    });
    await publicClient.waitForTransactionReceipt({hash: depositTx})
    await weth.write.transfer([instance.address, amount]);

    // 2 - Check that the router contract is holding some tokens
    const wethBalanceInContractBeforeWithdraw = await weth.read.balanceOf(
      [instance.address],
    );
    expect(wethBalanceInContractBeforeWithdraw.toString()).to.equal(amount);

    // 3 - Withdraw the tokens
    const withdrawTokenTx = instance.write.withdrawToken([weth.address, receiver.account.address, amount])
    const withdrawTokenReceipt = await publicClient.waitForTransactionReceipt({hash: withdrawTokenTx})
    await expect(withdrawTokenTx)
      .to.emit(instance, "TokenWithdrawn")
      .withArgs(
        getAddress(weth.address),
        getAddress(receiver.account.address),
        amount,
      );

    const wethBalanceInContractAfterWithdraw = await weth.read.balanceOf(
      [instance.address]
    );
    const wethBalanceInReceiver = await weth.read.balanceOf([receiver.account.address]);

    // 4 - Confirm the tokens were moved
    expect(wethBalanceInContractAfterWithdraw.toString()).to.equal("0");
    expect(wethBalanceInReceiver.toString()).to.equal(amount);
  });

  it("Should revert if attempting to withdraw tokens when sender is not the owner", async function () {
    // 1 - Send some tokens to the contract
    const amount = 10000000n;
    const accounts = await hre.viem.getWalletClients();
    const receiver = accounts[2];

    const depositTx = await weth.write.deposit({
      value: amount,
    });
    await publicClient.waitForTransactionReceipt({hash: depositTx})
    await weth.write.transfer([instance.address, amount]);

    // 2 - Check that the router contract is holding some tokens
    const wethBalanceInContractBeforeWithdraw = await weth.read.balanceOf(
      [instance.address],
    );
    expect(wethBalanceInContractBeforeWithdraw.toString()).to.equal(amount);


    // 3 - Withdraw the tokens
    expect(
      instance
        .connect(accounts[2])
        .withdrawToken(weth.address, receiver.address, amount),
    ).to.be.revertedWith("ONLY_OWNER");
  });

  it("Should be able to withdraw ETH", async function () {
    // 1 - Send some ETH to the contract
    const amount =10000000n;
    const accounts = await hre.viem.getWalletClients();
    const signer = accounts[0];
    const receiver = accounts[2];
    await signer.sendTransaction({ to: instance.address, value: amount });

    // 2 - Check that the router contract is holding some ETH
    const startingEthBalanceInReceiver = await publicClient.getBalance({address: receiver.account.address});
    const ethBalanceInContractBeforeWithdraw = await publicClient.getBalance({
      address: instance.address,
    });
    expect(ethBalanceInContractBeforeWithdraw.toString()).to.equal(
      amount.toString(),
    );

    // 3 - Withdraw the ETH
    await expect(instance.write.withdrawEth([receiver.address, amount]))
      .to.emit(instance, "EthWithdrawn")
      .withArgs(receiver.account.address, amount);

    const ethBalanceInContractAfterWithdraw = await publicClient.getBalance({
      address: instance.address,
    });
    const ethBalanceInReceiver = await publicClient.getBalance({address: receiver.account.address});

    // 4 - Confirm the tokens were moved
    expect(ethBalanceInContractAfterWithdraw.toString()).to.equal("0");

    const finalReceiverExpectedBalance =
      startingEthBalanceInReceiver+amount;
    expect(ethBalanceInReceiver).to.equal(
      finalReceiverExpectedBalance,
    );
  });

  it("Should revert if attempting to withdraw ETH when sender is not the owner", async function () {
    // 1 - Send some ETH to the contract
    const amount = 10000000n;
    const accounts = await hre.viem.getWalletClients();
    const signer = accounts[0];
    const receiver = accounts[2];
    await signer.sendTransaction({ to: instance.address, value: amount });

    // 2 - Check that the router contract is holding some ETH
    const ethBalanceInContractBeforeWithdraw = await publicClient.getBalance(
      {address: instance.address},
    );
    expect(ethBalanceInContractBeforeWithdraw.toString()).to.equal(
      amount.toString(),
    );

    // 3 - Withdraw the ETH
    expect(
      instance.connect(accounts[2]).withdrawEth(receiver.account.address, amount),
    ).to.be.revertedWith("ONLY_OWNER");
  });

  it("Should be able to add swap targets", async function () {
    await expect(instance.write.updateSwapTargets([MAINNET_ADDRESS_1INCH, true]))
      .to.emit(instance, "SwapTargetAdded")
      .withArgs(getAddress(MAINNET_ADDRESS_1INCH));
    const exists = await instance.read.swapTargets([MAINNET_ADDRESS_1INCH]);
    expect(exists).to.equal(true);
  });

  it("Should be able to remove swap targets", async function () {
    await expect(instance.write.updateSwapTargets([MAINNET_ADDRESS_1INCH, false]))
      .to.emit(instance, "SwapTargetRemoved")
      .withArgs(getAddress(MAINNET_ADDRESS_1INCH));
    const exists = await instance.read.swapTargets([MAINNET_ADDRESS_1INCH]);
    expect(exists).to.equal(false);
  });

  it("Should revert if attempting to add swap targets when sender is not the owner", async function () {
    const accounts = await hre.viem.getWalletClients();
    expect(
      instance
        .connect(accounts[2])
        .updateSwapTargets(MAINNET_ADDRESS_1INCH, true),
    ).to.be.revertedWith("ONLY_OWNER");
  });

  it("Should revert if attempting to remove swap targets when sender is not the owner", async function () {
    const accounts = await hre.viem.getWalletClients();
    expect(
      instance
        .connect(accounts[2])
        .updateSwapTargets(MAINNET_ADDRESS_1INCH, false),
    ).to.be.revertedWith("ONLY_OWNER");
  });

  it("Should revert if attempting to transfer ownership to ZERO_ADDRESS", async function () {
    expect(
      instance.write.transferOwnership(zeroAddress),
    ).to.be.revertedWith("ZERO_ADDRESS");
  });

  it("Should be able to transfer ownership", async function () {
    const accounts = await hre.viem.getWalletClients();
    const previousOwner = accounts[0].account.address;
    const newOwnerAddress = accounts[1].account.address;

    await expect(instance.write.transferOwnership(newOwnerAddress))
      .to.emit(instance, "OwnerChanged")
      .withArgs(newOwnerAddress, previousOwner);

    const currentOwner = await instance.owner();
    expect(currentOwner).to.equal(newOwnerAddress);
  });

  it("Should revert if attempting transferOwnership when sender is not the owner", async function () {
    const accounts = await hre.viem.getWalletClients();
    const newOwnerAddress = accounts[1].account.address;
    expect(
      instance.connect(accounts[2]).transferOwnership(newOwnerAddress),
    ).to.be.revertedWith("ONLY_OWNER");
  });

  it('Should revert if an attacker attempts "Approval snatching" from a victim that previously approved an ERC20 token on RainbowRouter', async function () {
    const amount = 10000000n;
    const attackerSellAmount = 1n;
    const accounts = await hre.viem.getWalletClients();
    const victim = accounts[1];
    const attacker = accounts[2];

    // 1 - Get some WETH to the victim
    await weth.connect(victim).deposit({
      value: amount,
    });

    // 2 - Approve the Rainbow contract to transfer WETH from the victim's account
    await weth.connect(victim).approve(instance.address, amount);

    // 3 - Get some WETH to the attacker
    await weth.connect(attacker).deposit({
      value: attackerSellAmount,
    });

    await getContract({
      address: weth.address,
      abi: weth.abi,
      client: {
        wallet: attacker,
      }
    }).write.approve([instance.address, attackerSellAmount]);

    // WETH.transferFrom(victim, attacker, amount);
    const malicousCalldata = weth.interface.encodeFunctionData("transferFrom", [
      victim.account.address,
      attacker.account.address,
      amount,
    ]);

    // 5 - Call swap aggregator with the malicious calldata
    // to execute approval snatching attack
    const hackTx = instance
    .connect(attacker)
    .fillQuoteTokenToEth(
      WETH_ADDRESS,
      WETH_ADDRESS,
      malicousCalldata,
      attackerSellAmount,
      "0",
      {
        value: "0",
      },
    );

    expect(hackTx).to.be.revertedWith("TARGET_NOT_AUTH");
  });

  it('Should revert if an attacker attempts "Approval snatching" trying to steal collected fees from RainbwoRouter', async function () {
    const amount = "10000000";
    const attackerSellAmount = "1";
    const accounts = await hre.viem.getWalletClients();
    const attacker = accounts[2];

    // 1 - Check that the router contract is holding some tokens
    const wethBalanceInContract = await weth.balanceOf(instance.address);
    expect(wethBalanceInContract.toString()).to.equal(amount.toString());

    // 2 - Get some WETH to the attacker
    await weth.connect(attacker).deposit({
      value: attackerSellAmount,
    });

    // 4 - Approve the Rainbow contract to transfer WETH from the attacker's account
    await weth.connect(attacker).approve(instance.address, attackerSellAmount);

    // WETH.transferFrom(instance.address, attacker, amount);
    const malicousCalldata = weth.interface.encodeFunctionData("transferFrom", [
      instance.address,
      attacker.address,
      wethBalanceInContract,
    ]);

    // 5 - Call swap aggregator with the malicious calldata
    // to execute approval snatching attack
    const hackTx = instance
    .connect(attacker)
    .fillQuoteTokenToEth(
      WETH_ADDRESS,
      WETH_ADDRESS,
      malicousCalldata,
      attackerSellAmount,
      "0",
      {
        value: "0",
      },
    );

    expect(hackTx).to.be.revertedWith("TARGET_NOT_AUTH");
  });

  it("Should revert if someone that is not an allowed swap target sends eth", async function () {
    const accounts = await hre.viem.getWalletClients();
    const sender = accounts[0];
    const tx = sender.sendTransaction({
      to: instance.address,
    });
    expect(tx).to.be.revertedWith("NO_RECEIVE");
  });
});
