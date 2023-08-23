// contracts/TokenVesting.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./AuditPayment.sol";
import "./BevorDAO.sol";

/**
 * @title MockTokenVesting
 * WARNING: use only for testing and debugging purpose
 */
contract MockAuditPayment is AuditPayment {
    uint256 mockTime = 0;

    constructor(IAudit audit_, BevorDAO dao_) AuditPayment(dao_, audit_) {}

    function setCurrentTime(uint256 _time) external {
        mockTime = _time;
    }

    function getCurrentTime() internal view virtual override returns (uint256) {
        return mockTime;
    }
}
