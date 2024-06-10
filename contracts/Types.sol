// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Let's assume vesting terms are globally set by the Audit itself.
struct Audit {
    address protocolOwner;
    ERC20 token;
    uint256 amount;
    uint256 duration;
    uint256 cliff;
    uint256 start;
    uint256 nftTokenId;
    uint256 invalidatingProposalId;
    bool isActive;
}
