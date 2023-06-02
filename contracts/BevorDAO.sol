// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/governance/Governor.sol";

contract BevorDAO is Governor {

    constructor(
    ) Governor("Bevor DAO") {
    }

}