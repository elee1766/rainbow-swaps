/* eslint-disable import/no-extraneous-dependencies */
import { promises as fs } from "fs";
import { signTypedData_v4, TypedDataUtils } from "eth-sig-util";
import { addHexPrefix, toBuffer } from "ethereumjs-util";
import { DomainParam, MessageParam, Quote } from "../types";
import { Address, Hex, hexToNumber, parseSignature, toHex, zeroAddress } from "viem";

import hre from "hardhat";

function bigIntReplacer(key: string, value: any): any {
  if (typeof value === "bigint") {
    return value.toString() + 'n';
  }
  return value;
}

const debug = false;
const showGasUsage = false;
const MAINNET_ADDRESS_1INCH = "0x1111111254fb6c44bac0bed2854e76f90643097d";
const MAINNET_ADDRESS_0X = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ENS_ADDRESS = "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72";
const RAD_ADDRESS = "0x31c8eacbffdd875c74b94b077895bd78cf1e64a3";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const INCH_ADDRESS = "0x111111111117dc0aa78b770fa6a738034120c302";
const WNXM_ADDRESS = "0x0d438f3b5175bebc262bf23753c1e53d03432bde";
const VSP_ADDRESS = "0x1b40183efb4dd766f11bda7a7c3ad8982e998421";
const LQTY_ADDRESS = "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d";
const TORN_ADDRESS = "0x77777feddddffc19ff86db637967013e6c6a116c";
const BAL_ADDRESS = "0xba100000625a3754423978a60c9317c58a424e3d";
const OPIUM_ADDRESS = "0x888888888889c00c67689029d7856aac1065ec11";
const MIST_ADDRESS = "0x88acdd2a6425c3faae4bc9650fd7e27e0bebb7ab";
const TRIBE_ADDRESS = "0xc7283b66eb1eb5fb86327f08e1b5816b0720212b";
const FEI_ADDRESS = "0x956f47f50a910163d8bf957cf5846d573e7f87ca";

const Logger = {
  info(...args: any[]) {
    // eslint-disable-next-line no-console
    console.info(...args);
  },
  log(...args: any[]) {
    // eslint-disable-next-line no-console
    debug && console.log(...args);
  },
};

const getVaultBalanceForToken = async (
  tokenAddress: Hex,
  vaultAddress: Hex,
) => {
  const tokenContract = await hre.viem.getContractAt("IERC20", tokenAddress);
  return tokenContract.read.balanceOf([vaultAddress]);
};

const init = async () => {
  const wethContract = await hre.viem.getContractAt("IWETH", WETH_ADDRESS);
  const daiContract = await hre.viem.getContractAt("IDAI", DAI_ADDRESS);

  const signer = (await hre.viem.getWalletClients())[0];
  Logger.log("User address", signer.account.address);

  const rainbowRouterInstance = await hre.viem.deployContract("RainbowRouter", [], {
    maxFeePerGas: 62722250707n
  });
  Logger.log("Contract address", rainbowRouterInstance.address);

  await rainbowRouterInstance.write.updateSwapTargets([
    MAINNET_ADDRESS_1INCH,
    true,
  ]);
  await rainbowRouterInstance.write.updateSwapTargets([
    MAINNET_ADDRESS_0X,
    true,
  ]);

  await rainbowRouterInstance.write.updateValidSigner([zeroAddress, true]);

  const publicClient = await hre.viem.getPublicClient();

  const getEthVaultBalance = async () =>
    publicClient.getBalance({ address: rainbowRouterInstance.address });
  const getSignerBalance = async () =>
    publicClient.getBalance({ address: signer.account.address });

  return {
    getSignerBalance,
    daiContract,
    getEthVaultBalance,
    rainbowRouterInstance,
    signer,
    wethContract,
    publicClient,
  };
};

const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const getDomainSeparator = async (
  name: any,
  version: string,
  chainId: any,
  verifyingContract: any,
) => {
  return (
    "0x" +
    TypedDataUtils.hashStruct(
      "EIP712Domain",
      { chainId, name, verifyingContract, version },
      { EIP712Domain: EIP712_DOMAIN_TYPE },
    ).toString("hex")
  );
};

const getPermitVersion = async (
  tokenAddress: Address,
  name: any,
  chainId: any,
  verifyingContract: any,
) => {
  const token = await hre.viem.getContractAt("IERC2612", tokenAddress);
  try {
    const version = await token.read.version();
    return version;
  } catch (e) {
    const version = "1";
    try {
      const domainSeparator = await token.read.DOMAIN_SEPARATOR();
      const domainSeparatorValidation = await getDomainSeparator(
        name,
        version,
        chainId,
        verifyingContract,
      );

      if (domainSeparator === domainSeparatorValidation) {
        return version;
      }
    } catch (_) {
      if (
        [TORN_ADDRESS, WNXM_ADDRESS, VSP_ADDRESS]
          .map((t) => t.toLowerCase())
          .indexOf(token.address.toLowerCase()) !== -1
      ) {
        return "1";
      }
      return null;
    }
    return null;
  }
};

const getNonces = async (token: Address, owner: any) => {
  const isDaiStylePermit = token.toLowerCase() === DAI_ADDRESS.toLowerCase();
  try {
  if (isDaiStylePermit) {
    const tokenContract = await hre.viem.getContractAt("IDAI", token);
    const nonce = await tokenContract.read.nonces([owner]);
    return nonce;
  } else {
    const tokenContract = await hre.viem.getContractAt(
      "IERC2612Extension",
      token,
    );
    const nonce = await tokenContract.read._nonces([owner]);
    return nonce;
  }
  } catch (e) {
    return 0
  }
};

const EIP712_DOMAIN_TYPE_NO_VERSION = [
  { name: "name", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const EIP2612_TYPE = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

const PERMIT_ALLOWED_TYPE = [
  { name: "holder", type: "address" },
  { name: "spender", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "allowed", type: "bool" },
];

async function signPermit(
  token: Address,
  owner: Address,
  spender: Address,
  value: bigint,
  deadline: bigint,
  chainId: number,
) {
  const tokenContract = await hre.viem.getContractAt("IERC20Metadata", token);

  const isDaiStylePermit = token.toLowerCase() === DAI_ADDRESS.toLowerCase();

  const name = await tokenContract.read.name();
  const [nonce, version] = await Promise.all([
    getNonces(token, owner),
    getPermitVersion(token as any, name, chainId, token),
  ]);

  const message: MessageParam = {
    nonce: Number(nonce.toString()),
    spender,
  };

  if (isDaiStylePermit) {
    message.holder = owner;
    message.allowed = true;
    message.expiry = Number(deadline.toString());
  } else {
    message.value = toHex(value);
    message.deadline = Number(deadline.toString());
    message.owner = owner;
  }

  const domain: DomainParam = {
    chainId,
    name,
    verifyingContract: token,
  };
  if (version !== null) {
    domain.version = version;
  }

  const types = {
    EIP712Domain:
      version !== null ? EIP712_DOMAIN_TYPE : EIP712_DOMAIN_TYPE_NO_VERSION,
    Permit: isDaiStylePermit ? PERMIT_ALLOWED_TYPE : EIP2612_TYPE,
  };

  const data = {
    domain,
    message,
    primaryType: "Permit",
    types,
  };

  const privateKeyBuffer = toBuffer(
    addHexPrefix(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
  );

  const signature = signTypedData_v4(privateKeyBuffer, {
    data: data as any,
  }) as Hex;

  const { r, s } = parseSignature(signature);
  const v = hexToNumber(`0x${signature.slice(130)}`)
  return {
    deadline,
    isDaiStylePermit,
    nonce,
    r,
    s,
    v: v,
    value: value,
  };
}

async function getQuoteFromFile(
  dir: string,
  source: string,
  tradeType: string,
  inputAsset: string,
  outputAsset: string,
  amount: string,
  feePercentageBasisPoints: string,
): Promise<Quote> {
  const fileName = `${dir}/${source}-${tradeType}-${inputAsset}-${outputAsset}-${amount}-${feePercentageBasisPoints}.json`;

  const data: any = await fs.readFile(fileName);
  const quote: Quote = JSON.parse(data);

  return quote;
}

export {
  showGasUsage,
  BAL_ADDRESS,
  DAI_ADDRESS,
  ETH_ADDRESS,
  FEI_ADDRESS,
  getQuoteFromFile,
  getVaultBalanceForToken,
  INCH_ADDRESS,
  init,
  Logger,
  LQTY_ADDRESS,
  MIST_ADDRESS,
  OPIUM_ADDRESS,
  RAD_ADDRESS,
  signPermit,
  TORN_ADDRESS,
  TRIBE_ADDRESS,
  ENS_ADDRESS,
  USDC_ADDRESS,
  VSP_ADDRESS,
  WETH_ADDRESS,
  WNXM_ADDRESS,
  MAINNET_ADDRESS_1INCH,
  MAINNET_ADDRESS_0X,
  bigIntReplacer,
};
