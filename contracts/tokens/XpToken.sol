// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract XpToken is ERC20{
    
    constructor() 
       ERC20("Experince", "XP")  {  
          _mint(msg.sender, 500*(10**18));
    }
}