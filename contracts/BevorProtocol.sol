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
import "./DAOProxy.sol";
import "./IDAOProxy.sol";

/**
 * @title AuditPayment
 */
contract BevorProtocol is Ownable, ReentrancyGuard {
    // Let's assume vesting terms are globally set by the Audit itself.
    struct Audit {
      address protocolOwner;
      ERC20 token;
      uint256 amount;
      uint256 duration;
      uint256 cliff;
      uint256 start;
      uint256 invalidatingProposalId;
      bool isActive;
    }

    struct VestingSchedule {
        address auditor;
        uint256 amount;
        uint256 withdrawn;
        uint256 auditId;
    }

    uint256[] public vestingSchedulesIds;
    mapping(uint256 => Audit) public audits;
    mapping(uint256 => uint256[]) public auditToVesting;
    mapping(uint256 => VestingSchedule) public vestingSchedules;
    mapping(address => uint256) public holdersVestingCount;
    address public nft;
    address public dao;

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

    event VestingScheduleCreated(
        address indexed ProtocolOwner,
        address indexed auditor,
        string finding,
        uint256 cliff,
        uint256 start,
        uint256 duration,
        uint256 slicePeriodSeconds,
        uint256 amountTotal,
        ERC20 token,
        uint256 tokenId
    );

    /**
     * @dev Emitted when an audit is created with a unique identifier.
     * @param auditId The unique identifier for the audit.
     */
    event AuditCreated(uint256 indexed auditId);

    /**
     * @dev Creates a vesting contract.
     * @param dao_ address of the Bevor DAO that controls
     */
    constructor(address dao_, address nft_) {
        // Check that the token address is not 0x0.
        require(address(dao_) != address(0x0));
        require(address(nft_) != address(0x0));
        dao = dao_;
        nft = nft_;
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
     * @dev creates the locked version of the audit once all parties agree on terms
     * also creates the vesting schedules. Marks all as inactive.
     * @param auditors an array of auditors to conduct the audit
     * @param cliff the cliff duration
     * @param details a string hash of the protocol owner provided audit details
     * @param amount total price of the audit
     * @param token ERC20 token to be used for escrow + payment
     * @param salt a random string
     */

    function prepareAudit(
      address[] memory auditors,
      uint256 cliff,
      uint256 duration,
      string  memory details,
      uint256 amount,
      ERC20 token,
      string memory salt
    ) public {
        require(bytes(details).length > 0, "details must be provided");
        require(auditors.length > 0, "at least 1 auditor must be provided");
        require(duration > 0, "TokenVesting: duration must be > 0");
        require(amount > 0, "TokenVesting: amount must be > 0");
        require(duration >= cliff, "TokenVesting: duration must be >= cliff");

        uint256 auditId = generateAuditId(
          _msgSender(),
          auditors,
          cliff,
          duration,
          details,
          amount,
          token,
          salt
        );

        audits[auditId] = Audit(
          _msgSender(),
          token,
          amount,
          duration,
          cliff,
          0,
          0,
          false
        );

        uint256[] memory auditorArr = new uint256[](auditors.length);

        for (uint256 i = 0; i < auditors.length; i++) {
          address auditor = auditors[i];
          uint256 vestingScheduleId = computeNextVestingScheduleIdForHolder(auditor);
          uint256 currentVestingCount = holdersVestingCount[auditor];
          holdersVestingCount[auditor] = currentVestingCount + 1;
          
          auditorArr[i] = vestingScheduleId;

          vestingSchedules[vestingScheduleId] = VestingSchedule(
            auditor,
            0,
            amount / auditors.length,
            auditId
          );
        }

        auditToVesting[auditId] = auditorArr;

        emit AuditCreated(auditId);
    }

    /**
     * @dev Generates a Proof Of Integrity as the keccak256 hash of the concatenated string of all vesting fields.
     * @param auditee The address of the auditee.
     * @param auditors The addresses of the auditors.
     * @param cliff The cliff period in seconds.
     * @param duration The duration of the vesting period in seconds.
     * @param details The hash of the provided audit details.
     * @param amountTotal The total amount of tokens to be released at the end of the vesting.
     * @param token The address of the ERC20 token being vested.
     * @param salt The random salt uint256
     * @return The keccak256 hash of the concatenated vesting data.
     */
    function generateAuditId(
        address auditee,
        address[] memory auditors,
        uint256 cliff,
        uint256 duration,
        string  memory details,
        uint256 amountTotal,
        ERC20 token,
        string memory salt
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            auditee,
            auditors,
            cliff,
            duration,
            details,
            amountTotal,
            token,
            salt
        )));
    }

    /**
     * @dev Generates a Proof of Integrity as the keccak256 hash of the original audit, concatenated with additional findings.
     * @param auditId auditId of Audit constructor
     * @param findings findings produced by auditors
     */
    function generateTokenId(
      uint256 auditId,
      string[] memory findings
    ) public pure returns (uint256) {
        bytes memory findingsData = "";
        for (uint i = 0; i < findings.length; i++) {
            findingsData = abi.encodePacked(findingsData, findings[i]);
        }
        return uint256(keccak256(abi.encodePacked(
            auditId,
            findingsData
        )));
    }

    /**
     * @dev Posts findings to the original audit, called by protocol owner of that audit. Kicks off vesting.
     * @param auditors addresses of the auditors
     * @param findings findings produced by auditors
     * @param auditId auditId of interest to post findings to
     */
    function revealFindings(address[] memory auditors, string[] memory findings, uint256 auditId) public {

        Audit storage targetAudit = audits[auditId];
        uint256[] storage schedules = auditToVesting[auditId];

        require(targetAudit.protocolOwner == _msgSender(), "Only the auditee can mint this NFT");
        require(auditors.length == findings.length, "mismatch in auditors and findings lengths");
        require(schedules.length == auditors.length, "incorrect number of auditors passed");
        require(!targetAudit.isActive, "audit schedule is already active");

        targetAudit.isActive = true;
        targetAudit.token.transferFrom(msg.sender, address(this), targetAudit.amount);

        require(
            targetAudit.token.balanceOf(address(this)) >= targetAudit.amount,
            "TokenVesting: cannot create vesting schedule because insufficient tokens"
        );
        
        targetAudit.start = block.timestamp;

        for (uint256 i = 0; i < schedules.length; i++) {
            uint256 scheduleId = schedules[i];
            address auditor = auditors[i];
            string memory finding = findings[i];
            VestingSchedule storage schedule = vestingSchedules[scheduleId];
            require(bytes(finding).length > 0, "cannot provide an empty finding");
            require(schedule.auditor == auditor, "mismatch in order of auditors");
        }

        // can easily be recreated starting from a source Audit struct.
        uint256 tokenId = generateTokenId(auditId, findings);

        IAudit(nft).mint(_msgSender(), tokenId);
    }

    /**
     * @notice Invalidates an audit and returns payment from all child vesting schedules
     * @param auditId the audit identifier
     */
    function invalidateAudit(uint256 auditId) public onlyDAO {
        Audit storage targetAudit = audits[auditId];
        uint256[] storage targetSchedules = auditToVesting[auditId];

        require(IDAOProxy(dao).isVestingInvalidated(targetAudit.invalidatingProposalId), "Cannot invalidate vesting schedule if proposal is not passed");

        // payout whatever remains from the vested funds to the auditor
        // as the difference between audit price and total withdrawn funds by auditors.
        uint256 totalWithdrawn = 0;
        for (uint256 i = 0; i < targetSchedules.length; i++) {
          VestingSchedule storage schedule = vestingSchedules[targetSchedules[i]];
          uint256 vestedAmount = _computeReleasableAmount(schedule);
          if (vestedAmount > 0) {
            schedule.withdrawn += vestedAmount;
            targetAudit.token.transfer(schedule.auditor, vestedAmount);
          }
          totalWithdrawn = totalWithdrawn + schedule.withdrawn;
        }
        
        // AND then the DAO + voters... TBD.
        targetAudit.token.transfer(targetAudit.protocolOwner, targetAudit.amount - totalWithdrawn);
    }

    function proposeCancelVesting(uint256 auditId, string memory calldata1) public {
        Audit storage targetAudit = audits[auditId];

        require(targetAudit.invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
        require(msg.sender == targetAudit.protocolOwner, "Cannot propose that the audit is invalid if you are not the protocol owner");

        console.log(
                "%s is proposing that the vesting schedule is cancelled.",
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

        console.log("All of the above variables worked");

        // Assuming 'dao' is your DAO contract
        targetAudit.invalidatingProposalId = IDAOProxy(dao).propose(targets, values, calldatas, "Proposal to cancel vesting for audit");

        console.log("Invalidating Proposal Id: %s", targetAudit.invalidatingProposalId);
    }

    // TODO: Figure out a way to have this set automatically when a proposal is created
    // seems redudant with function above, as both set the invalidatingProposalID
    function setInvalidatingProposalId(uint256 auditId, uint256 invalidatingProposalId) external {
        Audit storage targetAudit = audits[auditId];

        
        require(targetAudit.invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
        // This require statement doesn't make sense, or maybe the message just doesn't make sense... does it?
        require(msg.sender == targetAudit.protocolOwner, "Cannot propose that the audit is invalid if you are not the auditee");

       targetAudit.invalidatingProposalId = invalidatingProposalId;
    }

    /**
      * @dev If vesting proposal exits and is in the voting or execution stages. Otherwise will return false and allow vesting. 
      */
    function isWithdrawPaused(uint256 auditId) public view returns (bool) {
        Audit storage targetAudit = audits[auditId];

        return IDAOProxy(dao).isWithdrawFrozen(targetAudit.invalidatingProposalId);
    }

    /**
     * @notice Release vested amount of tokens.
     * @param vestingScheduleId the vesting schedule identifier
     */
    function withdraw(
        uint256 vestingScheduleId
    ) public nonReentrant {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
        Audit storage parentAudit = audits[vestingSchedule.auditId];

        bool isAuditor = msg.sender == vestingSchedule.auditor;
        bool isReleasor = (msg.sender == owner());

        require(
            isAuditor || isReleasor,
            "TokenVesting: only beneficiary and owner can release vested tokens"
        );

        console.log(
                "Is withdrawl frozen?: %s",
                isWithdrawPaused(vestingScheduleId)
        ); 

        require(!IDAOProxy(dao).isWithdrawFrozen(parentAudit.invalidatingProposalId), "Withdrawing is paused due to pending proposal cannot withdraw tokens");
       
        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        vestingSchedule.withdrawn += vestedAmount;

        console.log(
                "%s is withdrawing %s tokens and has withdrawn %s total",
                msg.sender,
                vestedAmount,
                vestingSchedule.withdrawn
        );

        parentAudit.token.transfer(vestingSchedule.auditor, vestedAmount);
    }

    /**
     * @dev Returns the number of vesting schedules associated to an auditor.
     * @param _auditor address of auditor
     * @return count the number of vesting schedules
     */
    function getVestingSchedulesCountByAuditor(
        address _auditor
    ) external view returns (uint256) {
        return holdersVestingCount[_auditor];
    }

    /**
     * @dev Returns the vesting schedule id at the given index.
     * @param index the index of the vesting schedule
     * @return vestingId vesting id
     */
    function getVestingIdAtIndex(
        uint256 index
    ) external view returns (uint256) {
        require(
            index < getVestingSchedulesCount(),
            "TokenVesting: index out of bounds"
        );
        return vestingSchedulesIds[index];
    }

    /**
     * @notice Returns the vesting schedule information for a given holder and index.
     * @param auditor auditor to get the vesting schedule for
     * @param index index of the vesting schedule for the auditor.
     * @return vestingSchedule the vesting schedule structure information
     */
    function getVestingScheduleByAddressAndIndex(
        address auditor,
        uint256 index
    ) external view returns (VestingSchedule memory) {
        return
            getVestingSchedule(
                computeVestingScheduleIdForAddressAndIndex(auditor, index)
            );
    }

    /**
     * @dev Returns the number of vesting schedules managed by this contract.
     * @return total the total number of vesting schedules
     */
    function getVestingSchedulesCount() public view returns (uint256) {
        return vestingSchedulesIds.length;
    }

    /**
     * @notice Computes the vested amount of tokens for the given vesting schedule identifier.
     * @param vestingScheduleId id to compute releaseable amounts for.
     * @return amount the vested amount since last withdrawal
     */
    function computeReleasableAmount(uint256 vestingScheduleId) external view returns (uint256) {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
        return _computeReleasableAmount(vestingSchedule);
    }

    /**
     * @notice Returns the vesting schedule information for a given identifier.
     * @return the vesting schedule structure information
     */
    function getVestingSchedule(uint256 vestingScheduleId) public view returns (VestingSchedule memory) {
        return vestingSchedules[vestingScheduleId];
    }

    /**
     * @dev Computes the next vesting schedule identifier for a given holder address.
     */
    function computeNextVestingScheduleIdForHolder(address holder) public view returns (uint256) {
        return computeVestingScheduleIdForAddressAndIndex(
          holder,
          holdersVestingCount[holder]
        );
    }

    /**
     * @dev Returns the last vesting schedule for a given holder address.
     */
    function getLastVestingScheduleForHolder(address holder) external view returns (VestingSchedule memory) {
        return vestingSchedules[
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
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(holder, index)));
    }

    /**
     * @dev Computes the releasable amount of tokens for a vesting schedule.
     * @return the amount of releasable tokens
     */
    function _computeReleasableAmount(
        VestingSchedule memory vestingSchedule
    ) internal view returns (uint256) {
        // Parent audit retains baseline audit terms.
        Audit storage parentAudit = audits[vestingSchedule.auditId];

        uint256 currentTime = block.timestamp;
        // If the current time is before the cliff, no tokens are releasable.
        if (currentTime < parentAudit.cliff + parentAudit.start) {
            return 0;
        }
        // If the current time is after the vesting period, all tokens are releasable,
        // minus the amount already released.
        else if (currentTime >= parentAudit.start + parentAudit.duration) {
            return vestingSchedule.amount - vestingSchedule.withdrawn;
        }
        // Otherwise, some tokens are releasable.
        else {
            uint256 m = vestingSchedule.amount / (parentAudit.start + parentAudit.duration);
            uint256 x = currentTime - parentAudit.start;
            uint256 y = m * x;
            // Subtract the amount already released and return.
            return y - vestingSchedule.withdrawn;
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
