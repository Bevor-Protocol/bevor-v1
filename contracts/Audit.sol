// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ISmartAgreement.sol";

contract Audit is ERC721Enumerable, Ownable, ERC2771Recipient {
    struct AuditInfo {
        // Hashed details of the audit
        uint256 details;
        // Hashed findings of the audit
        uint256 findings;
        // Auditor of the NFT 
        address auditee;
    }

    address[] internal _test;
    uint256 public maxTokensPerWallet = 100;

    mapping(uint256 => AuditInfo) public audits;
    mapping(uint256 => bool) public auditRevealed;

    /**
     * @dev Emitted when an audit is created with a unique identifier.
     * @param auditId The unique identifier for the audit.
     */
    event AuditCreated(uint256 indexed auditId);


    constructor() ERC721("BevorAuditDeliverable", "BAD") { }

    function _msgSender() internal view override(Context, ERC2771Recipient) returns (address sender) {
        sender = ERC2771Recipient._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Recipient) returns (bytes calldata) {
        return ERC2771Recipient._msgData();
    }

    function createAudit(uint256 auditId) public onlyOwner() {
        audits[auditId] = AuditInfo(auditId, 0, _msgSender());
        emit AuditCreated(auditId);
    }

    function mint(address _to, uint256 auditId, uint256 tokenId) public onlyOwner() {
        require(audits[auditId].auditee == _msgSender(), "Only the auditee can mint this NFT");
        require(keccak256(abi.encodePacked(audits[auditId].details)) != keccak256(abi.encodePacked("")), "Audit ID does not exist");

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
     * @param auditors The addresses of the auditors.
     * @param auditee The address of the auditee.
     * @param cliff The cliff period in seconds.
     * @param start The start time of the vesting period.
     * @param duration The duration of the vesting period in seconds.
     * @param slicePeriodSeconds The duration of a slice period for the vesting in seconds.
     * @param invalidatingProposalId The ID of the proposal that can invalidate the vesting.
     * @param amountTotal The total amount of tokens to be released at the end of the vesting.
     * @param withdrawn The amount of tokens already withdrawn.
     * @param token The address of the ERC20 token being vested.
     * @param auditTokenId The ID of the associated ERC721 audit NFT.
     * @return The keccak256 hash of the concatenated vesting data.
     */
    function generateAuditId(
        address[] memory auditors,
        address auditee,
        string memory details,
        uint256 cliff,
        uint256 start,
        uint256 duration,
        uint256 slicePeriodSeconds,
        uint256 invalidatingProposalId,
        uint256 amountTotal,
        uint256 withdrawn,
        address token,
        uint256 auditTokenId,
        uint256 salt
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            auditors,
            auditee,
            details,
            cliff,
            start,
            duration,
            slicePeriodSeconds,
            invalidatingProposalId,
            amountTotal,
            withdrawn,
            token,
            auditTokenId,
            salt
        )));
    }

    /**
     * @dev Generates a Proof Of Integrity as the keccak256 hash of the concatenated string of all vesting fields.
     * @param auditors The addresses of the auditors.
     * @param auditee The address of the auditee.
     * @param cliff The cliff period in seconds.
     * @param start The start time of the vesting period.
     * @param duration The duration of the vesting period in seconds.
     * @param slicePeriodSeconds The duration of a slice period for the vesting in seconds.
     * @param invalidatingProposalId The ID of the proposal that can invalidate the vesting.
     * @param amountTotal The total amount of tokens to be released at the end of the vesting.
     * @param withdrawn The amount of tokens already withdrawn.
     * @param token The address of the ERC20 token being vested.
     * @param auditTokenId The ID of the associated ERC721 audit NFT.
     * @return The keccak256 hash of the concatenated vesting data.
     */
    function generateTokenId(
        address[] memory auditors,
        address auditee,
        string memory findings,
        uint256 cliff,
        uint256 start,
        uint256 duration,
        uint256 slicePeriodSeconds,
        uint256 invalidatingProposalId,
        uint256 amountTotal,
        uint256 withdrawn,
        address token,
        uint256 auditTokenId,
        uint256 salt
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            auditors,
            auditee,
            findings,
            cliff,
            start,
            duration,
            slicePeriodSeconds,
            invalidatingProposalId,
            amountTotal,
            withdrawn,
            token,
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
