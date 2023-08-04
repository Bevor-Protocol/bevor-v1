pragma solidity ^0.8.0;

import "@openzeppelin/contracts/governance/Governor.sol";
import "./AuditPayment.sol";

contract ProposalProxy {
    Governor _bevorDAO;
    AuditPayment _aP;

    constructor(Governor bevorDAO, AuditPayment aP) {
       _bevorDAO = bevorDAO;
       _aP = aP; 
    }

    function createProposal(bytes32 vestingScheduleId, address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) public {
        _aP.togglePauseWithdrawl(vestingScheduleId);
        _bevorDAO.propose(targets, values, calldatas, description);
    }

    function quorum(bytes32 vestingScheduleId, uint256 blockNumber) public {
        // Require paused withdrawl to be true
        _aP.togglePauseWithdrawl(vestingScheduleId);
        _bevorDAO.quorum(blockNumber);
    }

}