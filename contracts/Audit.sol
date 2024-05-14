// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ISmartAgreement.sol";
import "./IAuditPayment.sol";

contract Audit is ERC721Enumerable, Ownable, ERC2771Recipient {
    struct AuditInfo {
        // Auditor of the NFT 
        address auditee;
        // Auditors
        address[] auditors;
        // cliff of vesting period
        uint256 cliff;
        // duration of audit
        uint256 duration;
        // define vesting schedule
        uint256 slicePeriodSeconds;
        // total amount to pay for audit
        uint256 amountTotal;
        // address of erc20 to be vested
        ERC20 token;
    }

    address[] internal _test;
    uint256 public maxTokensPerWallet = 100;

    mapping(uint256 => AuditInfo) public audits;
    mapping(uint256 => bool) public auditRevealed;

    address public vesting;

    /**
     * @dev Emitted when an audit is created with a unique identifier.
     * @param auditId The unique identifier for the audit.
     */
    event AuditCreated(uint256 indexed auditId);


    constructor(address vesting_) ERC721("BevorAuditDeliverable", "BAD") {
      require(address(vesting_) != address(0x0));
      vesting = vesting_;
      IAuditPayment(vesting).setAuditContract(address(this));
    }

    function _msgSender() internal view override(Context, ERC2771Recipient) returns (address sender) {
        sender = ERC2771Recipient._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Recipient) returns (bytes calldata) {
        return ERC2771Recipient._msgData();
    }
    
    function createAudit(
      address[] memory auditors,
      uint256 cliff,
      uint256 duration,
      string  memory details,
      uint256 slicePeriodSeconds,
      uint256 amountTotal,
      ERC20 token,
      uint256 salt) public {
        require(bytes(details).length > 0, "details must be provided");
        require(auditors.length > 0, "at least 1 auditor must be provided");

        uint256 auditId = generateAuditId(
          _msgSender(),
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amountTotal,
          token,
          salt
        );

        // putting more information in the struct allows us to access it later in mint()
        // without passing repetitive parameters.
        audits[auditId] = AuditInfo(_msgSender(), auditors, cliff, duration, slicePeriodSeconds, amountTotal, token);
        emit AuditCreated(auditId);
    }

    function mint(address _to, uint256 auditId, string[] memory findings, address[] memory auditors, uint256 salt) public {
        require(audits[auditId].auditee == _to, "Only the auditee can mint this NFT");
        require(audits[auditId].auditors.length == auditors.length, "Mismatch in number of auditors");
        require(audits[auditId].auditors.length == findings.length, "Mismatch in number of findings");

        for(uint i = 0; i < findings.length; i++) {
          require(audits[auditId].auditors[i] == auditors[i], "Mismatch between findings and auditors");
        }

        uint256 tokenId = generateTokenId(
          _msgSender(),
          findings,
          auditId,
          salt
        );

        IAuditPayment(vesting).createVestingSchedules(
          _msgSender(),
          audits[auditId].auditors,
          block.timestamp,
          audits[auditId].cliff,
          audits[auditId].duration,
          audits[auditId].slicePeriodSeconds,
          audits[auditId].amountTotal,
          audits[auditId].token,
          tokenId
        );

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
