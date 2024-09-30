// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "./IBevorDAO.sol";
import "./IAudit.sol";
import "./Types.sol";
import "./BevorProtocol.sol";

contract BevorDAO is IBevorDAO, Governor, GovernorSettings, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction, GovernorTimelockControl, Ownable {
    ProposalState public propState;

    // TODO (Blake Hatch) Figure out if these constructor values are good
    constructor(IVotes _token, TimelockController _timelock)
        Governor("BevorGovernor")
        GovernorSettings(7200 /* 1 day */, 50400 /* 1 week */, 0)
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)
        GovernorTimelockControl(_timelock)
    {
    }

    BevorProtocol public bevorProtocol;

    function setBevorProtocol(BevorProtocol _protocol) public onlyOwner {
        bevorProtocol = _protocol;
    }

    function isWithdrawFrozen(uint256 proposalId) public view returns (bool) {
        ProposalState proposalState = state(proposalId);
        return proposalState == ProposalState.Pending || proposalState == ProposalState.Active;
    }

    function isVestingInvalidated(uint256 proposalId) public view returns (bool) {
        ProposalState proposalState = state(proposalId);
        return proposalState == ProposalState.Succeeded || proposalState == ProposalState.Queued || proposalState == ProposalState.Executed;
    }

    // The following functions are overrides required by Solidity.
    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    /**
     * Create a proposal for cancelling vesting 
     * @param targets The targets to be executed
     * @param values The first value must be a valid auditId
     * @param calldatas The calldatas to be executed 
     * @param description The description of the proposal to cancel vesting 
     */
    function propose(
        address[] memory targets, 
        uint256[] memory values, 
        bytes[] memory calldatas, 
        string memory description 
    ) 
        public 
        override(Governor, IGovernor, IBevorDAO) 
        returns (uint256) 
    {
        uint256 auditId = values[0];

        (
            address protocolOwner,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bool isActive
        ) = bevorProtocol.audits(auditId);

        require(isActive, "Cannot cancel vesting since it hasn't started yet");
        require(msg.sender == protocolOwner, "Cannot propose that the audit is invalid if you are not the protocol owner");

        // Call the propose function from the Governor base contract
        uint256 proposalId = super.propose(targets, values, calldatas, description);

        bevorProtocol.addInvalidatingProposalId(auditId, proposalId);

        return proposalId;
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _execute(uint256 proposalId, address[] memory targets, uint256[] memory values, bytes[] memory calldatas, bytes32 descriptionHash)
        internal
        override(Governor, GovernorTimelockControl)
    {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, bytes32 descriptionHash)
        internal
        override(Governor, GovernorTimelockControl)
        returns (uint256)
    {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
