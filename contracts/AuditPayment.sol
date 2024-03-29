// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin dependencies
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/governance/IGovernor.sol";
import "hardhat/console.sol";
import "./IAudit.sol";
import "./IBevorDAO.sol";
import "./BevorDAO.sol";

/**
 * @title AuditPayment
 */
contract AuditPayment is Ownable, ReentrancyGuard {
    struct VestingSchedule {
        // beneficiary of tokens after they are released
        address auditor;
        // beneficiary of tokens after they are released
        address auditee;
        // cliff period in seconds
        uint256 cliff; 
        // start time of the vesting period
        uint256 start;
        // duration of the vesting period in seconds
        uint256 duration;
        // duration of a slice period for the vesting in seconds
        uint256 slicePeriodSeconds;
        // whether or not the vesting is revocable
        uint256 invalidatingProposalId;
        // total amount of tokens to be released at the end of the vesting
        uint256 amountTotal;
        // amount of tokens withdrawn
        uint256 withdrawn;
        // address of the ERC20 token vesting
        ERC20 token;
        // address of the ERC721 audit NFT
        uint256 tokenId;
    }

    bytes32[] public vestingSchedulesIds;
    mapping(bytes32 => VestingSchedule) public vestingSchedules;
    mapping(address => uint256) public holdersVestingCount;
    IAudit public audit;
    BevorDAO public dao;

    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    /**
     * @dev Creates a vesting contract.
     * @param dao_ address of the Bevor DAO that controls
     */
    constructor(BevorDAO dao_, IAudit audit_) {
        // Check that the token address is not 0x0.
        require(address(dao_) != address(0x0));
        require(address(audit_) != address(0x0));
        dao = dao_;
        audit = audit_;
    }

    modifier onlyDAO() {
        require(msg.sender == address(dao));
            _;
    }

    /**
     * @dev This function is called for plain Ether transfers, i.e. for every call with empty calldata.
     */
    receive() external payable {}

    /**
     * @dev Fallback function is executed if none of the other functions match the function
     * identifier or no data was provided with the function call.
     */
    fallback() external payable {}

    /**
     * @notice Creates a new vesting schedule for a beneficiary.
     * @param _auditor address of the beneficiary to whom vested tokens are transferred
     * @param _start start time of the vesting period
     * @param _cliff duration in seconds of the cliff in which tokens will begin to vest
     * @param _duration duration in seconds of the period in which the tokens will vest
     */
    function createVestingSchedule(
        address _auditor,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration,
        uint256 _slicePeriodSeconds,
        uint256 _amount,
        ERC20 _token,
        uint256 _tokenId
    ) external onlyOwner {
        _token.transferFrom(msg.sender, address(this), _amount);

        require(
            _token.balanceOf(address(this)) >= _amount,
            "TokenVesting: cannot create vesting schedule because not sufficient tokens"
        );
        require(_duration > 0, "TokenVesting: duration must be > 0");
        require(_amount > 0, "TokenVesting: amount must be > 0");
        require(
            _slicePeriodSeconds >= 1,
            "TokenVesting: slicePeriodSeconds must be >= 1"
        );
        require(_duration >= _cliff, "TokenVesting: duration must be >= cliff");
        bytes32 vestingScheduleId = computeNextVestingScheduleIdForHolder(
            _auditor
        );
        uint256 cliff = _start + _cliff;

        vestingSchedules[vestingScheduleId] = VestingSchedule(
            _auditor,
            msg.sender,
            cliff,
            _start,
            _duration,
            _slicePeriodSeconds,
            0,
            _amount,
            0,
            _token,
            _tokenId
        );

        vestingSchedulesIds.push(vestingScheduleId);
        uint256 currentVestingCount = holdersVestingCount[_auditor];
        holdersVestingCount[_auditor] = currentVestingCount + 1;

        // Revert if audit nft does not exist (probably do this is NFT contract)
        //require(audit.ownerOf(_tokenId) == _auditor, "Audit NFT is not owned by caller");

        // Reveal audit metadata once payment starts
        // TODO: Make sure that this can be called by the contract not msg.sender [FIX THIS]
        //audit.trustlessHandoff(_auditor, msg.sender, _tokenId);
    }

    /**
     * @notice Revokes the vesting schedule for given identifier.
     * @param vestingScheduleId the vesting schedule identifier
     */
    function invalidateAudit(
        bytes32 vestingScheduleId
    ) public onlyDAO {
        VestingSchedule storage vestingSchedule = vestingSchedules[
            vestingScheduleId
        ];

        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        if (vestedAmount > 0) {
            vestingSchedule.withdrawn += vestedAmount;
            vestingSchedule.token.transfer(vestingSchedule.auditor, vestedAmount);
        }

        uint256 returnTotalAmount = vestingSchedule.amountTotal - vestingSchedule.withdrawn;
        
        vestingSchedule.token.transfer(vestingSchedule.auditee, returnTotalAmount);
    }

    //TODO: Figure out why openzeppelin propose doesn't work 
    function proposeCancelVesting(bytes32 vestingScheduleId, string memory calldata1) public {
        VestingSchedule storage vestingSchedule =
            vestingSchedules[vestingScheduleId];

        require(vestingSchedule.invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
        require(msg.sender == vestingSchedule.auditee, "Cannot propose that the audit is invalid if you are not the auditee");

        console.log(
                "%s is proposing vesting schedule is cancelled.",
                address(this) 
        );

        // Your DAO proposal creation logic might look like this: TODO:
        // Replace the following lines with your actual DAO proposal
        // creation code
        address[] memory targets = new address[](1); 
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(this); 
        values[0] = 0;
        calldatas[0] = bytes(calldata1);

        console.log("All of the above variables workd");

        // Assuming 'dao' is your DAO contract
        vestingSchedule.invalidatingProposalId = dao.propose(targets, values, calldatas, "Proposal to cancel vesting for audit");

        console.log("Invalidating Proposal Id: %s", vestingSchedule.invalidatingProposalId);
    }

    function setInvalidatingProposalId(bytes32 vestingScheduleId, uint256 invalidatingProposalId) external {
        VestingSchedule storage vestingSchedule =
            vestingSchedules[vestingScheduleId];


        require(vestingSchedule.invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
        require(msg.sender == vestingSchedule.auditee, "Cannot propose that the audit is invalid if you are not the auditee");

       vestingSchedule.invalidatingProposalId = invalidatingProposalId;
    }

    /**
      * @dev If vesting proposal exits and is in the voting or execution stages. Otherwise will return false and allow vesting. 
      */
    function isWithdrawlPaused(bytes32 vestingScheduleId) public view returns (bool) {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];

        if (vestingSchedule.invalidatingProposalId != 0) {
            console.log("Enum one: %s vs. two: %s", uint256(IGovernor.ProposalState.Pending), uint256(dao.state(vestingSchedule.invalidatingProposalId)));

            // (vestingSchedule.auditee == dao.proposalProposer(vestingSchedule.invalidatingProposalId)) && 

            return uint256(dao.state(vestingSchedule.invalidatingProposalId)) == uint256(IGovernor.ProposalState.Pending);
 

           /*return (vestingSchedule.auditee == dao.proposalProposer(vestingSchedule.invalidatingProposalId)) && 
               (dao.state(vestingSchedule.invalidatingProposalId) == dao.propState()) ||
                dao.state(vestingSchedule.invalidatingProposalId) == dao.propState.Active() ||
                dao.state(vestingSchedule.invalidatingProposalId) == dao.propState.Succeeded() ||
                dao.state(vestingSchedule.invalidatingProposalId) == dao.propState.Queued() ||
                dao.state(vestingSchedule.invalidatingProposalId) == dao.propState.Executed()
                ); 
              */ 
        } else {
            return false;
        } 
    }

    /**
     * @notice Release vested amount of tokens.
     * TODO: Figure out how to restrict withdrawls when the 
     * @param vestingScheduleId the vesting schedule identifier
     */
    function withdraw(
        bytes32 vestingScheduleId
    ) public nonReentrant {
        VestingSchedule storage vestingSchedule = vestingSchedules[
            vestingScheduleId
        ];

        require(!isWithdrawlPaused(vestingScheduleId), "Vesting is paused due to pending proposal cannot withdraw tokens");
       
        bool isBeneficiary = msg.sender == vestingSchedule.auditor;

        bool isReleasor = (msg.sender == owner());
        require(
            isBeneficiary || isReleasor,
            "TokenVesting: only beneficiary and owner can release vested tokens"
        );
        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        vestingSchedule.withdrawn += vestedAmount;

        console.log(
                "%s is withdrawing %s tokens and has withdrawn %s total",
                msg.sender,
                vestedAmount,
                vestingSchedule.withdrawn
        );

        vestingSchedule.token.transfer(vestingSchedule.auditor, vestedAmount);
    }

    /**
     * @dev Returns the number of vesting schedules associated to a beneficiary.
     * @return the number of vesting schedules
     */
    function getVestingSchedulesCountByBeneficiary(
        address _beneficiary
    ) external view returns (uint256) {
        return holdersVestingCount[_beneficiary];
    }

    /**
     * @dev Returns the vesting schedule id at the given index.
     * @return the vesting id
     */
    function getVestingIdAtIndex(
        uint256 index
    ) external view returns (bytes32) {
        require(
            index < getVestingSchedulesCount(),
            "TokenVesting: index out of bounds"
        );
        return vestingSchedulesIds[index];
    }

    /**
     * @notice Returns the vesting schedule information for a given holder and index.
     * @return the vesting schedule structure information
     */
    function getVestingScheduleByAddressAndIndex(
        address holder,
        uint256 index
    ) external view returns (VestingSchedule memory) {
        return
            getVestingSchedule(
                computeVestingScheduleIdForAddressAndIndex(holder, index)
            );
    }

    /**
     * @dev Returns the number of vesting schedules managed by this contract.
     * @return the number of vesting schedules
     */
    function getVestingSchedulesCount() public view returns (uint256) {
        return vestingSchedulesIds.length;
    }

    /**
     * @notice Computes the vested amount of tokens for the given vesting schedule identifier.
     * @return the vested amount
     */
    function computeReleasableAmount(
        bytes32 vestingScheduleId
    )
        external
        view
        returns (uint256)
    {
        VestingSchedule storage vestingSchedule = vestingSchedules[
            vestingScheduleId
        ];
        return _computeReleasableAmount(vestingSchedule);
    }

    /**
     * @notice Returns the vesting schedule information for a given identifier.
     * @return the vesting schedule structure information
     */
    function getVestingSchedule(
        bytes32 vestingScheduleId
    ) public view returns (VestingSchedule memory) {
        return vestingSchedules[vestingScheduleId];
    }

    /**
     * @dev Computes the next vesting schedule identifier for a given holder address.
     */
    function computeNextVestingScheduleIdForHolder(
        address holder
    ) public view returns (bytes32) {
        return
            computeVestingScheduleIdForAddressAndIndex(
                holder,
                holdersVestingCount[holder]
            );
    }

    /**
     * @dev Returns the last vesting schedule for a given holder address.
     */
    function getLastVestingScheduleForHolder(
        address holder
    ) external view returns (VestingSchedule memory) {
        return
            vestingSchedules[
                computeVestingScheduleIdForAddressAndIndex(
                    holder,
                    holdersVestingCount[holder] - 1
                )
            ];
    }

    /**
     * @dev Computes the vesting schedule identifier for an address and an index.
     */
    function computeVestingScheduleIdForAddressAndIndex(
        address holder,
        uint256 index
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(holder, index));
    }

    /**
     * @dev Computes the releasable amount of tokens for a vesting schedule.
     * @return the amount of releasable tokens
     */
    function _computeReleasableAmount(
        VestingSchedule memory vestingSchedule
    ) internal view returns (uint256) {
        // Retrieve the current time.
        uint256 currentTime = getCurrentTime();
        // If the current time is before the cliff, no tokens are releasable.
        if (currentTime < vestingSchedule.cliff) {
            return 0;
        }
        // If the current time is after the vesting period, all tokens are releasable,
        // minus the amount already released.
        else if (
            currentTime >= vestingSchedule.start + vestingSchedule.duration
        ) {
            console.log(
                "Computing releasable amounts after vesting period from %s to %s %s tokens",
                msg.sender,
                vestingSchedule.amountTotal,
                vestingSchedule.withdrawn
            );
            return vestingSchedule.amountTotal - vestingSchedule.withdrawn;
        }
        // Otherwise, some tokens are releasable.
        else {
            // Compute the number of full vesting periods that have elapsed.
            uint256 timeFromStart = currentTime - vestingSchedule.start;
            uint256 secondsPerSlice = vestingSchedule.slicePeriodSeconds;
            uint256 vestedSlicePeriods = timeFromStart / secondsPerSlice;
            uint256 vestedSeconds = vestedSlicePeriods * secondsPerSlice;
            // Compute the amount of tokens that are vested.
            uint256 vestedAmount = (vestingSchedule.amountTotal *
                vestedSeconds) / vestingSchedule.duration;
            // Subtract the amount already released and return.
            return vestedAmount - vestingSchedule.withdrawn;
        }
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds. (Switch to internal when deploying)
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}
