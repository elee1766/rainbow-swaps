//SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.11;


import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

library CanoeHelper {
    struct Warrant {
        uint160 nonce;
        uint48  validBefore;
        uint48  validAfter;

        address verifyingSigner;
        bytes signature;
    }

    function _packValidationData(
        uint160 nonce,
        uint48  validBefore,
        uint48  validAfter
    ) internal pure returns (uint256) {
        return
        uint160(nonce) |
            (uint256(validBefore) << 160) |
            (uint256(validAfter) << (160 + 48));
    }

    function verifyWarrant(
        bytes32 dataHash,
        Warrant memory warrant
    ) internal view {
        require(warrant.validBefore <= block.timestamp, "CANOE: EXPIRED");
        require(warrant.validAfter >= block.timestamp, "CANOE: NOT_YET");
        require(warrant.validAfter <= warrant.validBefore, "CANOE: INVALID TIMESTAMPS");

        // if the verifyingSigner is 0, it means that the warrant system is disabled, and we will function like the rainbow router
        if(warrant.verifyingSigner == address(0)) {
            return;
        }

        bytes32 dataToVerify = keccak256(
            abi.encode(
                _packValidationData(
                    warrant.nonce,
                    warrant.validBefore,
                    warrant.validAfter
                ),
                dataHash
        ));
        address recoveredSigner = ECDSA.recover(dataToVerify, warrant.signature);
        require(recoveredSigner == warrant.verifyingSigner, "CANOE: INVALID_SIGNATURE");
    }
}
