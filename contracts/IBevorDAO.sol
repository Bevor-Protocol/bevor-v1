// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; 

/**
 * This interface allows out-of-the box DAO structures
 */
interface IBevorDAO {

     /**
      * Figure out structure to allow proposals from multiple DAO structures to work
      */
     function propose(address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description) external; 

    /**
      * Get proposal to check if proposal attached to vesting schedule is valid
      *
      */
    function getProposer(uint256 proposalId) external view returns (address);
}
