// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; 

import "@openzeppelin/contracts/governance/IGovernor.sol";
import "./IBevorDAO.sol";

contract ManualDAO is IBevorDAO {
    mapping(uint256 => bool) public proposalFrozen;
    mapping(uint256 => bool) public proposalInvalidated;
    uint256 public proposals = 0;

    function setProposalFrozen(uint256 proposalId, bool frozen) public {
        proposalFrozen[proposalId] = frozen;
    }

    function setProposalInvalidated(uint256 proposalId, bool invalidated) public {
        require(isWithdrawFrozen(proposalId), "Proposal must be frozen to invalidate.");
        proposalInvalidated[proposalId] = invalidated;
    }

    function isWithdrawFrozen(uint256 proposalId) public view returns (bool) {
        return proposalFrozen[proposalId];
    }

    function isVestingInvalidated(uint256 proposalId) public view returns (bool) {
        return proposalInvalidated[proposalId];
    }

    function propose(address[] memory, uint256[] memory, bytes[] memory, string memory) public returns (uint256) {
        proposals += 1;
        proposalFrozen[proposals] = true;
        return proposals;
    }
}