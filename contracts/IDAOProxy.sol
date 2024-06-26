// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; 

import "@openzeppelin/contracts/governance/IGovernor.sol";

/**
 * This interface allows out-of-the box DAO structures
 */
interface IDAOProxy {

    /**
      * Update the proposal withdraw status.
      *
      */
    function setProposalFrozen(uint256 proposalId, bool frozen) external;

    /** 
     * Mark an audit as invalidated.
    */
    function setProposalInvalidated(uint256 proposalId, bool invalidated) external;

    /**
      * Returns whether the proposal is in the voting state
      *
      */
    function isWithdrawFrozen(uint256 proposalId) external view returns (bool);

    /**
      * Returns whether the proposal has been voted true
      *
      */
    function isVestingInvalidated(uint256 proposalId) external view returns (bool);

    /**
      * Propose a new proposal
      *
      */
    function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) external returns (uint256);
}