// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.5.0) (token/ERC721/extensions/IERC721Enumerable.sol)

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title ActionItem standard for action items triggered by smart agreement being signed.
 */
interface IAudit is IERC721 {
    /**
     * @dev Creates a new agreement
     */
    function trustlessHandoff(address _from, address _to, uint256 _tokenId) external;

}
