// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BevorToken is ERC20 {

    constructor(
        uint256 totalSupply_
    ) ERC20("Bevor Token", "BVR") {
        _mint(msg.sender, totalSupply_);
    }

}