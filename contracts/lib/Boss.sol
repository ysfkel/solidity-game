 
pragma solidity ^0.8.4;

struct Boss {
    uint256 hp;
    uint256 damage;
    uint256 reward;
    uint16 punkIndex; // nft index at cryptopunks
    bool active;
}

// Library Definition
library BossLib {
    
    function isAlive(Boss storage boss) internal view returns(bool) {
        return  boss.hp > boss.damage;
    }
    
}