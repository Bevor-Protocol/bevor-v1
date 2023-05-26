// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.5.0) (token/ERC721/extensions/IERC721Enumerable.sol)

pragma solidity ^0.8.0;

/**
 * @title ActionItem standard for action items triggered by smart agreement being signed.
 */
interface ISmartAgreement {
    /**
     * @dev Creates a new agreement
     */
    function mint(address[] memory _signees, string memory _metadataContent, uint256 _salt) external;

    /**
     * @dev Signs the agreement
     */
    function sign(uint256 _tokenId) external;
}