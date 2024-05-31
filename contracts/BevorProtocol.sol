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
import "./IBevorDAO.sol";
import "./Types.sol";

/**
 * @title AuditPayment
 */
contract BevorProtocol is Ownable, ReentrancyGuard {
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
     * @dev Sets a new DAO address.
     * @param newDao The address of the new DAO.
     */
    function setDaoAddress(address newDao) external {
        require(newDao != address(0), "New DAO address cannot be the zero address");
        dao = newDao;
    }

    /**
     * @dev Modifies the invalidating proposal ID in an existing audit.
     * @param auditId The ID of the audit to modify.
     * @param invalidatingProposalId The new invalidating proposal ID to set.
     */
    function addInvalidatingProposalId(uint256 auditId, uint256 invalidatingProposalId) external onlyDAO {
        Audit storage targetAudit = audits[auditId];

        require(targetAudit.isActive, "Cannot modify since the audit hasn't started yet");
        require(targetAudit.invalidatingProposalId == 0, "Cannot modify the invalidating proposal ID more than once");

        targetAudit.invalidatingProposalId = invalidatingProposalId;
    }

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

      uint256 decimals = ERC20(token).decimals();

      // we handle the decimal conversion within generateAuditId() directly.
      uint256 auditId = generateAuditId(
        msg.sender,
        auditors,
        cliff,
        duration,
        details,
        amount,
        token,
        salt
      );

      audits[auditId] = Audit(
        msg.sender,
        token,
        amount * (10 ** decimals),
        duration,
        cliff,
        0,
        0,
        0,
        false
      );

      uint256[] memory auditorArr = new uint256[](auditors.length);

      for (uint256 i = 0; i < auditors.length; i++) {
        // we'll assume identical payout per auditor.
        address auditor = auditors[i];
        uint256 vestingScheduleId = computeNextVestingScheduleIdForHolder(auditor);
        uint256 currentVestingCount = holdersVestingCount[auditor];
        holdersVestingCount[auditor] = currentVestingCount + 1;
        vestingSchedulesIds.push(vestingScheduleId);
        
        auditorArr[i] = vestingScheduleId;

        vestingSchedules[vestingScheduleId] = VestingSchedule(
          auditor,
          amount * (10 ** decimals) / auditors.length,
          0,
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
     * @param amount The total amount of tokens to be released at the end of the vesting.
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
      uint256 amount,
      ERC20 token,
      string memory salt
    ) public view returns (uint256) {
      uint256 decimals = ERC20(token).decimals();
      return uint256(keccak256(abi.encodePacked(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount * (10 ** decimals),
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
     * @param findings findings produced by auditors
     * @param auditId auditId of interest to post findings to
     */
    function revealFindings(string[] memory findings, uint256 auditId) public {
      // removed passing auditors[] as a parameter. spoofing this is expensive, and we already have information
      // about which auditors belong to each audit, which is verifiable through the auditId generation.
      // further, it's not even used to generate the tokenId.

      Audit storage targetAudit = audits[auditId];
      uint256[] storage schedules = auditToVesting[auditId];

      require(targetAudit.protocolOwner == msg.sender, "Only the auditee can mint this NFT");
      require(schedules.length == findings.length, "incorrect number of auditors passed");
      require(!targetAudit.isActive, "audit schedule is already active");

      targetAudit.token.transferFrom(msg.sender, address(this), targetAudit.amount);

      require(
        targetAudit.token.balanceOf(address(this)) >= targetAudit.amount,
        "TokenVesting: cannot create vesting schedule because insufficient tokens"
      );
      
      targetAudit.isActive = true;
      targetAudit.start = block.timestamp;

      for (uint256 i = 0; i < findings.length; i++) {
        string memory finding = findings[i];
        require(bytes(finding).length > 0, "cannot provide an empty finding");
      }

      // can easily be recreated starting from a source Audit struct.
      uint256 tokenId = generateTokenId(auditId, findings);

        IAudit(nft).mint(msg.sender, tokenId);
    }

    /**
     * @notice Invalidates an audit and returns payment from all child vesting schedules
     * @param auditId the audit identifier
     */
    function returnFundsAfterAuditInvalidation(uint256 auditId) public {
        Audit storage targetAudit = audits[auditId];
        uint256[] storage targetSchedules = auditToVesting[auditId];

        require(IBevorDAO(dao).isVestingInvalidated(targetAudit.invalidatingProposalId), "Cannot invalidate vesting schedule if proposal is not passed");

        // payout whatever remains from the vested funds to the auditor
        // as the difference between audit price and total withdrawn funds by auditors.
        uint256 totalWithdrawn = 0;
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < targetSchedules.length; i++) {
          VestingSchedule storage schedule = vestingSchedules[targetSchedules[i]];
          totalWithdrawn = totalWithdrawn + schedule.withdrawn;
          totalAmount = totalAmount + schedule.amount;
        }
        
        // AND then the DAO + voters... TBD.
        targetAudit.token.transfer(targetAudit.protocolOwner, totalAmount - totalWithdrawn);
    }


    // TODO: Figure out a way to have this set automatically when a proposal is created
    // seems redudant with function above, as both set the invalidatingProposalID
    // function setInvalidatingProposalId(uint256 auditId, uint256 invalidatingProposalId) external {
    //     Audit storage targetAudit = audits[auditId];

        
    //     require(targetAudit.isActive, "Cannot invalidate since it hasn't started yet");
    //     require(targetAudit.invalidatingProposalId == 0, "Cannot set the cancellation proposal more than once"); 
    //     // This require statement doesn't make sense, or maybe the message just doesn't make sense... does it?
    //     require(msg.sender == targetAudit.protocolOwner, "Cannot propose that the audit is invalid if you are not the protocol owner");

    //     targetAudit.invalidatingProposalId = invalidatingProposalId;
    // }

    /**
      * @dev If vesting proposal exits and is in the voting or execution stages. Otherwise will return false and allow vesting. 
      */
    function isWithdrawPaused(uint256 auditId) public view returns (bool) {
      Audit storage targetAudit = audits[auditId];

      if (!targetAudit.isActive) {
        // don't even look in the DAO, as entry won't exist. Just return immediately.
        // Captures the case for auditID that doesn't exist, or auditID where isActive is false.
        return false;
      }

        return IBevorDAO(dao).isWithdrawFrozen(targetAudit.invalidatingProposalId);
    }

    /**
     * @notice Release vested amount of tokens.
     * @param vestingScheduleId the vesting schedule identifier
     */
    function withdraw(uint256 vestingScheduleId) public nonReentrant {
      VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
      Audit storage parentAudit = audits[vestingSchedule.auditId];

      bool isAuditor = msg.sender == vestingSchedule.auditor;
      bool isReleasor = (msg.sender == owner());

      require(
        isAuditor || isReleasor,
        "TokenVesting: only auditor and owner can release vested tokens"
      );

        // COME BACK TO THIS.
        require(!IBevorDAO(dao).isWithdrawFrozen(parentAudit.invalidatingProposalId), "Withdrawing is paused due to pending proposal cannot withdraw tokens");
       
        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        vestingSchedule.withdrawn += vestedAmount;

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
      require(index < getVestingSchedulesCount(), "TokenVesting: index out of bounds");
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

    function getVestingScheduleIdByAddressAndAudit(address auditor, uint256 auditId) public view returns (uint256) {
      uint256[] storage schedules = auditToVesting[auditId];
      for (uint256 i = 0; i < schedules.length; i++) {
        VestingSchedule storage schedule = vestingSchedules[schedules[i]];
        if (schedule.auditor == auditor) {
          return schedules[i];
        }
      }
      revert("No vesting schedule found for this auditor in this audit");
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
    function computeReleasableAmount(uint256 vestingScheduleId) public view returns (uint256) {
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
     * @notice helper function for returning the dynamically sized auditToVesting mapping.
     * @param auditId auditId to return vestingSchedules for.
     */
    function getVestingSchedulesForAudit(uint256 auditId) public view returns (uint256[] memory) {
      return auditToVesting[auditId];
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

      if (!parentAudit.isActive) {
        // captures inactive audits, or audits that don't exist.
        return 0;
      }

      if (isWithdrawPaused(vestingSchedule.auditId)) {
        // captures those that are frozen.
        return 0;
      }

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
        uint256 m = vestingSchedule.amount / parentAudit.duration;
        uint256 x = currentTime - parentAudit.start;
        uint256 y = m * x;
        // Subtract the amount already released and return.
        uint256 releasable = y - vestingSchedule.withdrawn;
        return releasable;
      }
    }
}
