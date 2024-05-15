// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "hardhat/console.sol";
import "./ISmartAgreement.sol";
import "./IAuditPayment.sol";

contract Audit is ERC721Enumerable, Ownable, ERC2771Recipient {

    address[] internal _test;
    uint256 public maxTokensPerWallet = 100;

    mapping(uint256 => bool) public auditRevealed;

    address public vesting;

    constructor(address vesting_) ERC721("BevorAuditDeliverable", "BAD") {
      
    }

    function _msgSender() internal view override(Context, ERC2771Recipient) returns (address sender) {
        sender = ERC2771Recipient._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Recipient) returns (bytes calldata) {
        return ERC2771Recipient._msgData();
    }
    
    function mint(address _to, uint256 tokenId) public onlyOwner {
        _mint(_to, tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function _burn(uint256 tokenId) internal override {
        super._burn(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _baseURI(uint256 tokenId) internal view virtual returns (string memory) {
        if (auditRevealed[tokenId]) {
            return "https://ipfs.io/ipfs/";
        }
        else {
            return "https://api.bevor.io/";
        }
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);

        string memory baseURI = _baseURI(tokenId);

        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, Strings.toString(tokenId))) : "";
    }

    function trustlessHandoff(address from, address to, uint256 tokenId) public {
        auditRevealed[tokenId] = true;
        transferFrom(from, to, tokenId);
    }

    /**
     * @dev Generates a Proof Of Integrity as the keccak256 hash of the concatenated string of all vesting fields.
     * @param auditee The address of the auditee.
     * @param auditors The addresses of the auditors.
     * @param cliff The cliff period in seconds.
     * @param duration The duration of the vesting period in seconds.
     * @param details The hash of the provided audit details.
     * @param slicePeriodSeconds The duration of a slice period for the vesting in seconds.
     * @param amountTotal The total amount of tokens to be released at the end of the vesting.
     * @param token The address of the ERC20 token being vested.
     * @param salt The random salt uint256
     * @return The keccak256 hash of the concatenated vesting data.
     */
    function generateAuditId(
        address auditee,
        address[] memory auditors,
        uint256 cliff,
        uint256 duration,
        string  memory details,
        uint256 slicePeriodSeconds,
        uint256 amountTotal,
        ERC20 token,
        uint256 salt
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            auditee,
            auditors,
            cliff,
            duration,
            details,
            slicePeriodSeconds,
            amountTotal,
            token,
            salt
        )));
    }

    /**
     * @dev Generates a Proof Of Integrity as the keccak256 hash of the concatenated string of all vesting fields.
     * @param auditee The address of the auditee.
     * @param findings The hash array of findings.
     * @param auditTokenId The ID of the associated ERC721 audit NFT.
     * @param salt random salt hash.
     * @return The keccak256 hash of the concatenated vesting data.
     */
    function generateTokenId(
        address auditee,
        string[] memory findings,
        uint256 auditTokenId,
        uint256 salt
    ) public pure returns (uint256) {
        bytes memory findingsData = "";
        for (uint i = 0; i < findings.length; i++) {
            findingsData = abi.encodePacked(findingsData, findings[i]);
        }
        return uint256(keccak256(abi.encodePacked(
            auditee,
            findingsData,
            auditTokenId,
            salt
        )));
    }

    /**
     * @dev Generates a Proof Of Integrity as the keccak256 hash of a human readable {base} and a randomly pre-generated number {salt}.
     */
    function generateProof(string memory base, uint256 salt) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(base, salt)));
    }

    /**
     * @dev Verifies a Proof Of Integrity {proof} against a human readable {base} and a randomly pre-generated number {salt}.
     */
    function verifyProof(uint256 tokenId, string memory base, uint256 salt) public pure returns (bool) {
        return tokenId == generateProof(base, salt);
    }
}
