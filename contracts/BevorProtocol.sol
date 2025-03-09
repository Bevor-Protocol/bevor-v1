// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin dependencies
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/governance/IGovernor.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import "hardhat/console.sol";
import "./IAudit.sol";
import "./IBevorDAO.sol";
import "./BevorDAO.sol";
import "./IBevorDAO.sol";
import "./Types.sol";
import "./PaymentNode.sol";

/**
 * @title AuditPayment
 */
contract BevorProtocol is Ownable, CCIPReceiver, ReentrancyGuard {
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

    // Event emitted when a message is received from another chain.
    event MessageReceived(
        bytes32 indexed messageId, // The unique ID of the CCIP message.
        uint64 indexed sourceChainSelector, // The chain selector of the source chain.
        address sender, // The address of the sender from the source chain.
        string text, // The text that was received.
        address token, // The token address that was transferred.
        uint256 tokenAmount // The token amount that was transferred.
    );

        /**
     * @notice Returns the details of the last CCIP received message.
     * @dev This function retrieves the ID, text, token address, and token amount of the last received CCIP message.
     * @return messageId The ID of the last received CCIP message.
     * @return text The text of the last received CCIP message.
     * @return tokenAddress The address of the token in the last CCIP received message.
     * @return tokenAmount The amount of the token in the last CCIP received message.
     */
    function getLastReceivedMessageDetails()
        public
        view
        returns (
            bytes32 messageId,
            string memory text,
            address tokenAddress,
            uint256 tokenAmount
        )
    {
        return (
            s_lastReceivedMessageId,
            s_lastReceivedText,
            s_lastReceivedTokenAddress,
            s_lastReceivedTokenAmount
        );
    }

    /**
     * @notice Retrieves a paginated list of failed messages.
     * @dev This function returns a subset of failed messages defined by `offset` and `limit` parameters. It ensures that the pagination parameters are within the bounds of the available data set.
     * @param offset The index of the first failed message to return, enabling pagination by skipping a specified number of messages from the start of the dataset.
     * @param limit The maximum number of failed messages to return, restricting the size of the returned array.
     * @return failedMessages An array of `FailedMessage` struct, each containing a `messageId` and an `errorCode` (RESOLVED or FAILED), representing the requested subset of failed messages. The length of the returned array is determined by the `limit` and the total number of failed messages.
     */
    function getFailedMessages(
        uint256 offset,
        uint256 limit
    ) external view returns (FailedMessage[] memory) {
        uint256 length = s_failedMessages.length();

        // Calculate the actual number of items to return (can't exceed total length or requested limit)
        uint256 returnLength = (offset + limit > length)
            ? length - offset
            : limit;
        FailedMessage[] memory failedMessages = new FailedMessage[](
            returnLength
        );

        // Adjust loop to respect pagination (start at offset, end at offset + limit or total length)
        for (uint256 i = 0; i < returnLength; i++) {
            (bytes32 messageId, uint256 errorCode) = s_failedMessages.at(
                offset + i
            );
            failedMessages[i] = FailedMessage(messageId, ErrorCode(errorCode));
        }
        return failedMessages;
    }

    /// @notice The entrypoint for the CCIP router to call. This function should
    /// never revert, all errors should be handled internally in this contract.
    /// @param any2EvmMessage The message to process.
    /// @dev Extremely important to ensure only router calls this.
    function ccipReceiveRevealFindingsMessage(
        Client.Any2EVMMessage calldata any2EvmMessage
    )
        external
        override
        onlyRouter
        onlyAllowlisted(
            any2EvmMessage.sourceChainSelector,
            abi.decode(any2EvmMessage.sender, (address))
        ) // Make sure the source chain and sender are allowlisted
    {
        /* solhint-disable no-empty-blocks */
        try this.processMessage(any2EvmMessage) {
            // Intentionally empty in this example; no action needed if processMessage succeeds
        } catch (bytes memory err) {
            // Could set different error codes based on the caught error. Each could be
            // handled differently.
            s_failedMessages.set(
                any2EvmMessage.messageId,
                uint256(ErrorCode.FAILED)
            );
            s_messageContents[any2EvmMessage.messageId] = any2EvmMessage;

            // Extract findings and auditId from the CCIP message data
            (string[] memory findings, uint256 auditId) = abi.decode(any2EvmMessage.data, (string[], uint256));

            revealFindings(findings, auditId);

            // Don't revert so CCIP doesn't revert. Emit event instead.
            // The message can be retried later without having to do manual execution of CCIP.
            emit MessageFailed(any2EvmMessage.messageId, err);
            return;
        }
    }

    /// @notice Serves as the entry point for this contract to process incoming messages.
    /// @param any2EvmMessage Received CCIP message.
    /// @dev Transfers specified token amounts to the owner of this contract. This function
    /// must be external because of the  try/catch for error handling.
    /// It uses the `onlySelf`: can only be called from the contract.
    function processMessage(
        Client.Any2EVMMessage calldata any2EvmMessage
    )
        external
        onlySelf
        onlyAllowlisted(
            any2EvmMessage.sourceChainSelector,
            abi.decode(any2EvmMessage.sender, (address))
        ) // Make sure the source chain and sender are allowlisted
    {
        // Simulate a revert for testing purposes
        if (s_simRevert) revert ErrorCase();

        _ccipReceive(any2EvmMessage); // process the message - may revert as well
    }

    /// @notice Allows the owner to retry a failed message in order to unblock the associated tokens.
    /// @param messageId The unique identifier of the failed message.
    /// @param tokenReceiver The address to which the tokens will be sent.
    /// @dev This function is only callable by the contract owner. It changes the status of the message
    /// from 'failed' to 'resolved' to prevent reentry and multiple retries of the same message.
    function retryFailedMessage(
        bytes32 messageId,
        address tokenReceiver
    ) external onlyOwner {
        // Check if the message has failed; if not, revert the transaction.
        if (s_failedMessages.get(messageId) != uint256(ErrorCode.FAILED))
            revert MessageNotFailed(messageId);

        // Set the error code to RESOLVED to disallow reentry and multiple retries of the same failed message.
        s_failedMessages.set(messageId, uint256(ErrorCode.RESOLVED));

        // Retrieve the content of the failed message.
        Client.Any2EVMMessage memory message = s_messageContents[messageId];

        // This example expects one token to have been sent, but you can handle multiple tokens.
        // Transfer the associated tokens to the specified receiver as an escape hatch.
        IERC20(message.destTokenAmounts[0].token).safeTransfer(
            tokenReceiver,
            message.destTokenAmounts[0].amount
        );

        // Emit an event indicating that the message has been recovered.
        emit MessageRecovered(messageId);
    }

    /// @notice Allows the owner to toggle simulation of reversion for testing purposes.
    /// @param simRevert If `true`, simulates a revert condition; if `false`, disables the simulation.
    /// @dev This function is only callable by the contract owner.
    function setSimRevert(bool simRevert) external onlyOwner {
        s_simRevert = simRevert;
    }

    function _ccipReceive(
        Client.Any2EVMMessage memory any2EvmMessage
    ) internal override {
        s_lastReceivedMessageId = any2EvmMessage.messageId; // fetch the messageId
        s_lastReceivedText = abi.decode(any2EvmMessage.data, (string)); // abi-decoding of the sent text
        // Expect one token to be transferred at once, but you can transfer several tokens.
        s_lastReceivedTokenAddress = any2EvmMessage.destTokenAmounts[0].token;
        s_lastReceivedTokenAmount = any2EvmMessage.destTokenAmounts[0].amount;
        emit MessageReceived(
            any2EvmMessage.messageId,
            any2EvmMessage.sourceChainSelector, // fetch the source chain identifier (aka selector)
            abi.decode(any2EvmMessage.sender, (address)), // abi-decoding of the sender address,
            abi.decode(any2EvmMessage.data, (string)),
            any2EvmMessage.destTokenAmounts[0].token,
            any2EvmMessage.destTokenAmounts[0].amount
        );
    }

    /// @notice Construct a CCIP message.
    /// @dev This function will create an EVM2AnyMessage struct with all the necessary information for programmable tokens transfer.
    /// @param _receiver The address of the receiver.
    /// @param _text The string data to be sent.
    /// @param _token The token to be transferred.
    /// @param _amount The amount of the token to be transferred.
    /// @param _feeTokenAddress The address of the token used for fees. Set address(0) for native gas.
    /// @return Client.EVM2AnyMessage Returns an EVM2AnyMessage struct which contains information for sending a CCIP message.
    function _buildCCIPMessage(
        address _receiver,
        string calldata _text,
        address _token,
        uint256 _amount,
        address _feeTokenAddress
    ) private pure returns (Client.EVM2AnyMessage memory) {
        // Set the token amounts
        Client.EVMTokenAmount[]
            memory tokenAmounts = new Client.EVMTokenAmount[](1);
        Client.EVMTokenAmount memory tokenAmount = Client.EVMTokenAmount({
            token: _token,
            amount: _amount
        });
        tokenAmounts[0] = tokenAmount;
        // Create an EVM2AnyMessage struct in memory with necessary information for sending a cross-chain message
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(_receiver), // ABI-encoded receiver address
            data: abi.encode(_text), // ABI-encoded string
            tokenAmounts: tokenAmounts, // The amount and type of token being transferred
            extraArgs: Client._argsToBytes(
                // Additional arguments, setting gas limit and allowing out-of-order execution.
                // Best Practice: For simplicity, the values are hardcoded. It is advisable to use a more dynamic approach
                // where you set the extra arguments off-chain. This allows adaptation depending on the lanes, messages,
                // and ensures compatibility with future CCIP upgrades. Read more about it here: https://docs.chain.link/ccip/best-practices#using-extraargs
                Client.EVMExtraArgsV2({
                    gasLimit: 400_000, // Gas limit for the callback on the destination chain
                    allowOutOfOrderExecution: true // Allows the message to be executed out of order relative to other messages from the same sender
                })
            ),
            // Set the feeToken to a feeTokenAddress, indicating specific asset will be used for fees
            feeToken: _feeTokenAddress
        });
        return evm2AnyMessage;
    }

    /**
     * @dev Emitted when an audit is created with a unique identifier.
     * @param auditId The unique identifier for the audit.
     */
    event AuditCreated(uint256 indexed auditId);

    /**
     * @dev Creates a vesting contract.
     * @param dao_ address of the Bevor DAO that controls
     */
    constructor(address dao_, address nft_, address paymentNode_) {
      // Check that the token address is not 0x0.
      require(address(dao_) != address(0x0));
      require(address(nft_) != address(0x0));
      require(address(paymentNode_) != address(0x0));
      dao = dao_;
      paymentNode = paymentNode_;
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

      targetAudit.nftTokenId = tokenId;
    }

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
    function withdraw(uint256 vestingScheduleId, uint256 chainId = 0) public nonReentrant {
      VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
      Audit storage parentAudit = audits[vestingSchedule.auditId];

      bool isAuditor = msg.sender == vestingSchedule.auditor;
      bool isProtocolOwner = msg.sender == parentAudit.protocolOwner;
      bool isReleasor = (msg.sender == owner());

      bool invalidated = IBevorDAO(dao).isVestingInvalidated(parentAudit.invalidatingProposalId);

      if (isProtocolOwner) {
        require(invalidated, "TokenVesting: audit must be invalidated for protocol owner to release vested tokens");
      } else {
        require(
          isAuditor || isReleasor,
          "TokenVesting: only auditor and owner can release vested tokens"
        );
      }

      // COME BACK TO THIS.
      if (!invalidated) {
        require(!IBevorDAO(dao).isWithdrawFrozen(parentAudit.invalidatingProposalId), "Withdrawing is paused due to pending proposal cannot withdraw tokens");
      }

      uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
      vestingSchedule.withdrawn += vestedAmount;

      // Maybe separate this into a separate helper function.
      if (chainId == 0) {
        if (invalidated) {
          parentAudit.token.transfer(parentAudit.protocolOwner, vestedAmount);
        } else {
          parentAudit.token.transfer(vestingSchedule.auditor, vestedAmount);
        }
      } else {
        if (invalidated) {
          PaymentNode(paymentNode).transferTokensPayLINK(
            chainId,
            vestingSchedule.protocolOwner,
            address(parentAudit.token),
            vestedAmount
          );
        } else {
          PaymentNode(paymentNode).transferTokensPayLINK(
            chainId,
            vestingSchedule.auditor,
            address(parentAudit.token),
            vestedAmount
          );
        }
      }
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
