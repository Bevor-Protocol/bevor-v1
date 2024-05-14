// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.5.0) (token/ERC721/extensions/IERC721Enumerable.sol)

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ActionItem standard for action items triggered by smart agreement being signed.
 */
interface IAuditPayment {
    /**
     * @dev Creates a new agreement
     */
    function createVestingSchedule(
      address[] memory auditors,
      uint256 start,
      uint256 cliff,
      uint256 duration,
      uint256 slicePeriodSeconds,
      uint256 amount,
      ERC20 token,
      uint256 tokenId) external;

}