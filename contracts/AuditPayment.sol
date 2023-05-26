// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract AuditPayment {
    address public owner;
    address public auditor;
    uint256 public vestingStartTime;
    uint256 public vestingPeriod;
    uint256 public totalAmount;
    uint256 public releasedAmount;
    IERC20 public usdcToken;
    AggregatorV3Interface public priceFeed;

    event PaymentReceived(uint256 amount);
    event PaymentReleased(uint256 amount);

    constructor(
        address _auditor,
        address _usdcToken,
        address _priceFeed,
        uint256 _vestingStartTime,
        uint256 _vestingPeriod
    ) {
        owner = msg.sender;
        auditor = _auditor;
        usdcToken = IERC20(_usdcToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
        vestingStartTime = _vestingStartTime;
        vestingPeriod = _vestingPeriod;
    }

    function receivePayment(uint256 _amount) external {
        require(msg.sender == owner, "Only contract owner can receive payment");
        require(_amount > 0, "Payment amount must be greater than zero");
        require(
            usdcToken.transferFrom(msg.sender, address(this), _amount),
            "USDC transfer failed"
        );

        totalAmount += _amount;
        emit PaymentReceived(_amount);
    }

    function releasePayment() external {
        require(msg.sender == auditor, "Only auditor can release payment");
        require(block.timestamp >= vestingStartTime, "Vesting period has not started");

        uint256 vestedAmount = calculateVestedAmount();
        uint256 amountToRelease = vestedAmount - releasedAmount;
        require(amountToRelease > 0, "No funds available for release");

        releasedAmount += amountToRelease;
        require(
            usdcToken.transfer(auditor, amountToRelease),
            "USDC transfer failed"
        );

        emit PaymentReleased(amountToRelease);
    }

    function calculateVestedAmount() public view returns (uint256) {
        if (block.timestamp >= vestingStartTime + vestingPeriod) {
            return totalAmount;
        } else {
            uint256 elapsedTime = block.timestamp - vestingStartTime;
            uint256 vestedAmount = (totalAmount * elapsedTime**2) / (vestingPeriod**2);
            return vestedAmount;
        }
    }

    function adjustVestingPeriod(uint256 _newVestingPeriod) external {
        require(msg.sender == owner, "Only contract owner can adjust the vesting period");
        require(block.timestamp < vestingStartTime, "Vesting period has already started");

        vestingPeriod = _newVestingPeriod;
    }

    function getUSDCPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price feed");
        return uint256(price);
    }

    function calculateVestedAmountAutomatically() external {
        require(block.timestamp >= vestingStartTime, "Vesting period has not started");

        uint256 usdcPrice = getUSDCPrice();
        uint256 elapsedSeconds = block.timestamp - vestingStartTime;
        uint256 vestedAmount = (totalAmount * elapsedSeconds) / vestingPeriod;

        if (vestedAmount > totalAmount) {
            vestedAmount = totalAmount;
        }

        uint256 amountToRelease = vestedAmount - releasedAmount;
        require(amountToRelease > 0, "No funds available for release");

        releasedAmount += amountToRelease;

        uint256 usdcBalance = usdcToken.balanceOf(address(this));
        require(usdcBalance >= amountToRelease, "Insufficient USDC balance in contract");

        require(
            usdcToken.transfer(auditor, amountToRelease),
            "USDC transfer failed"
        );

        emit PaymentReleased(amountToRelease);
    }
}
