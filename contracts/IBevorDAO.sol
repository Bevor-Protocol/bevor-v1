pragma solidity 

/**
 * This interface allows out-of-the box DAO structures
 */
interface IBevorDAO {

     /**
      * Figure out structure to allow proposals from multiple DAO structures to work
      */
     function external propose(address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description); 

    /**
      * Get proposal to check if proposal attached to vesting schedule is valid
      *
      */
    function external view getProposer(uint256 proposalId) returns (address);
}
