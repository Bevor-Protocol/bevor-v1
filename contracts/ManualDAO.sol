// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; 

import "@openzeppelin/contracts/governance/IGovernor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBevorDAO.sol";
import "./Types.sol";
import "./BevorProtocol.sol";

contract ManualDAO is IBevorDAO, Ownable {
    mapping(uint256 => bool) public proposalFrozen;
    mapping(uint256 => bool) public proposalInvalidated;
    uint256 public proposals = 0;

    BevorProtocol public bevorProtocol;

    function setBevorProtocol(BevorProtocol _protocol) public onlyOwner {
        bevorProtocol = _protocol;
    }

    // These these below to only be set by the protocol contract
    function setProposalFrozen(uint256 proposalId, bool frozen) public onlyOwner {
        proposalFrozen[proposalId] = frozen;
    }

    function setProposalInvalidated(uint256 proposalId, bool invalidated) public onlyOwner {
        require(isWithdrawFrozen(proposalId), "Proposal must be frozen to invalidate.");
        proposalInvalidated[proposalId] = invalidated;
    }

    function isWithdrawFrozen(uint256 proposalId) public view returns (bool) {
        return proposalFrozen[proposalId];
    }

    function isVestingInvalidated(uint256 proposalId) public view returns (bool) {
        return proposalInvalidated[proposalId];
    }

    function propose(address[] memory, uint256[] memory values, bytes[] memory, string memory) public returns (uint256) {
        proposals += 1;
        proposalFrozen[proposals] = true;

        uint256 auditId = values[0];

        (
            address protocolOwner,
            ,
            ,
            ,
            ,
            ,
            uint256 invalidatingProposalId,
            ,
            bool isActive
        ) = bevorProtocol.audits(auditId);

        require(isActive, "Cannot cancel vesting since it hasn't started yet");
        require(invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
        require(msg.sender == protocolOwner, "Cannot propose that the audit is invalid if you are not the protocol owner");

        bevorProtocol.addInvalidatingProposalId(auditId, proposals);

        return proposals;
    }
}