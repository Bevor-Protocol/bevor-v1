// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ISmartAgreement.sol";

contract Audit is ISmartAgreement, ERC1155, Ownable, ERC2771Recipient {

    mapping (address => bool) admins;
    address public trustedForwarder;

    struct AContract {
        mapping (address => bool) partySigned;
        mapping (uint256 => address) involvedParties;
        uint256 numParties;
    }

    mapping (uint256 => AContract) public tokenContracts;
    mapping (address => uint256[]) ownedTokenIds;

    event NewAgreement(uint256 tokenId, address[] parties);
    event SignAgreement(uint256 tokenId, address partySigning);

    constructor(address _forwarder, string memory _uri) ERC1155(_uri) {
        trustedForwarder = _forwarder;
    }

    modifier onlyAdmin() {
        require(admins[_msgSender()] == true);
            _;
    }

    function _msgSender() internal view override(Context, ERC2771Recipient) returns (address sender) {
        sender = ERC2771Recipient._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Recipient) returns (bytes calldata) {
        return ERC2771Recipient._msgData();
    }

    function addAdmin(address _newAdmin) external onlyOwner() {
        admins[_newAdmin] = true;
    }

    function removeAdmin(address _newAdmin) external onlyOwner() {
        admins[_newAdmin] = false;
    }

    function mint(address[] memory _signees, string memory _metadataContent, uint256 _salt) external {

        uint256 _tokenId = generateProof(_metadataContent, _salt);

        AContract storage tk = tokenContracts[_tokenId];

        tk.numParties = _signees.length;

        for (uint8 i = 0; i < tk.numParties; i++) {
            tk.involvedParties[i] = _signees[i];

            _mint(_signees[i], _tokenId, 1, "");

            ownedTokenIds[_signees[i]].push(_tokenId);
        }

        emit NewAgreement(_tokenId, _signees);
    }

    function sign(uint256 _tokenId) external {
        require(isInvolved(_tokenId, _msgSender()), "Signer must be involved in the contract");

        AContract storage tk = tokenContracts[_tokenId];

        tk.partySigned[_msgSender()] = true;

        emit SignAgreement(_tokenId, _msgSender());
    }

    function isInvolved(uint256 _tokenId, address _prospectiveSignee) public view returns (bool) {
        AContract storage tk = tokenContracts[_tokenId];

        for (uint8 i = 0; i < tk.numParties; i++) {
            if (_prospectiveSignee == tk.involvedParties[i]) {
                return true;
            }
        }

        return false;
    }

    /**
    * @dev shows whether all parties have signed or not
    *
    * @param _tokenId the contract id having it's signer's status checked
    */
    function allPartiesSigned(uint256 _tokenId) public view returns (bool) {
        AContract storage tk = tokenContracts[_tokenId];

        for (uint8 i = 0; i < tk.numParties; i++) {
            if (!tk.partySigned[tk.involvedParties[i]]) {
                return false;
            }
        }

        return true;
    }

    function getOwnedTokenIds(address _acct) public view returns(uint256[] memory) {
        uint256[] memory ret = new uint256[](ownedTokenIds[_acct].length);
        for (uint i = 0; i < ownedTokenIds[_acct].length; i++) {
            ret[i] = ownedTokenIds[_acct][i];
        }
        return ret;
    }

    function getPartiesInvolved(uint256 _tokenId) public view returns(address[] memory) {
        AContract storage tk = tokenContracts[_tokenId];
        address[] memory ret = new address[](tk.numParties);
        
        for (uint i = 0; i < tk.numParties; i++) {
            ret[i] = tk.involvedParties[i];
        }
        return ret;
    }

    function getSigningState(uint256 _tokenId, address _acct) public view returns(bool) {
        AContract storage tk = tokenContracts[_tokenId];

        return tk.partySigned[_acct];
    }

    /**
    * @dev returns the metadata uri for a given id
    *
    * @param _id the card id to return metadata for
    */
    function uri(uint256 _id) public view override returns (string memory) {
            //require(exists(_id), "URI: nonexistent token");

            if (allPartiesSigned(_id)) {
                return string(abi.encodePacked(super.uri(_id), "Signed_Document.json"));
            } 
            else {
                return string(abi.encodePacked(super.uri(_id), "Unsigned_Document.json"));
            }
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