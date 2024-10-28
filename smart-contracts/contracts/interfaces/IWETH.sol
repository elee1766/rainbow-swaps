//SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Weth Interface
/// @dev this interface is only used for testing purposes
interface IWETH is IERC20Metadata {
    function deposit() external payable;

    function withdraw(uint256) external;
}
