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

contract BevorDAOMock is IBevorDAO, IGovernor {
    BevorDAO public bevorDAO;

    constructor(
        IVotes,
        TimelockController,
        BevorDAO _protocol
    ) {
        bevorDAO = _protocol;
    }

    function isWithdrawFrozen(uint256 proposalId) public view returns (bool) {
        return bevorDAO.isWithdrawFrozen(proposalId);
    }

    function isVestingInvalidated(
        uint256 proposalId
    ) public view returns (bool) {
        return bevorDAO.isVestingInvalidated(proposalId);
    }

    // Override the state function to return different states for the first few proposalIds for testing
    function state(
        uint256 proposalId
    ) public view override(IGovernor) returns (ProposalState) {
        if (proposalId == 1) {
            return ProposalState.Pending;
        } else if (proposalId == 2) {
            return ProposalState.Active;
        } else if (proposalId == 3) {
            return ProposalState.Canceled;
        } else if (proposalId == 4) {
            return ProposalState.Executed;
        } else if (proposalId == 5) {
            return ProposalState.Succeeded;
        } else if (proposalId == 6) {
            return ProposalState.Defeated;
        } else {
            return bevorDAO.state(proposalId);
        }
    }

    // Forward all other calls to the BevorDAO instance
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(IGovernor, IBevorDAO) returns (uint256) {
        return bevorDAO.propose(targets, values, calldatas, description);
    }

    function votingDelay() public view override(IGovernor) returns (uint256) {
        return bevorDAO.votingDelay();
    }

    function votingPeriod() public view override(IGovernor) returns (uint256) {
        return bevorDAO.votingPeriod();
    }

    function quorum(
        uint256 blockNumber
    ) public view override(IGovernor) returns (uint256) {
        return bevorDAO.quorum(blockNumber);
    }

    function proposalThreshold() public view returns (uint256) {
        return bevorDAO.proposalThreshold();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external view override returns (bool) {}

    function clock() public view override returns (uint48) {}

    function CLOCK_MODE() public view override returns (string memory) {}

    function name() public view virtual override returns (string memory) {}

    function version() public view virtual override returns (string memory) {}

    function COUNTING_MODE()
        public
        view
        virtual
        override
        returns (string memory)
    {}

    function hashProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public pure virtual override returns (uint256) {}

    function proposalSnapshot(
        uint256 proposalId
    ) public view virtual override returns (uint256) {}

    function proposalDeadline(
        uint256 proposalId
    ) public view virtual override returns (uint256) {}

    function proposalProposer(
        uint256 proposalId
    ) public view virtual override returns (address) {}

    function getVotes(
        address account,
        uint256 timepoint
    ) public view virtual override returns (uint256) {}

    function getVotesWithParams(
        address account,
        uint256 timepoint,
        bytes memory params
    ) public view virtual override returns (uint256) {}

    function hasVoted(
        uint256 proposalId,
        address account
    ) public view virtual override returns (bool) {}

    function execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable virtual override returns (uint256 proposalId) {}

    function cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public virtual override returns (uint256 proposalId) {}

    function castVote(
        uint256 proposalId,
        uint8 support
    ) public virtual override returns (uint256 balance) {}

    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) public virtual override returns (uint256 balance) {}

    function castVoteWithReasonAndParams(
        uint256 proposalId,
        uint8 support,
        string calldata reason,
        bytes memory params
    ) public virtual override returns (uint256 balance) {}

    function castVoteBySig(
        uint256 proposalId,
        uint8 support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override returns (uint256 balance) {}

    function castVoteWithReasonAndParamsBySig(
        uint256 proposalId,
        uint8 support,
        string calldata reason,
        bytes memory params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override returns (uint256 balance) {}
}
