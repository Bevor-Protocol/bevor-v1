// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ISmartAgreement.sol";

contract Audit is ERC721Enumerable, Ownable, ERC2771Recipient {
    address[] internal _test;
    uint256 public maxTokensPerWallet = 100;
    uint256 _tokenId = 0;

    mapping(uint256 => bool) public auditRevealed;


    constructor() ERC721("BevorAuditDeliverable", "BAD") { }

    function _msgSender() internal view override(Context, ERC2771Recipient) returns (address sender) {
        sender = ERC2771Recipient._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Recipient) returns (bytes calldata) {
        return ERC2771Recipient._msgData();
    }

    function mint(address _to) public onlyOwner() {
        _tokenId += 1;
        _mint(_to, _tokenId);
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
