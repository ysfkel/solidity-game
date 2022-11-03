 
pragma solidity ^0.8.4;

enum ExperienceLevel{
    Apprentice, // Level 0
    Warrior , // Level 1
    Champion, // Level 2
    Master // Level 3
 }

 struct Character {
        uint256 hp;
        uint256 damage;
        uint256 xp;
        uint256 lastFireballAttack;
        bool active;
        uint256 height;
  }

// Library Definition
library CharacterLib {
    
    function experience(Character storage character) internal view  returns(ExperienceLevel level) {
        if(character.xp >= 20 && character.xp < 50 ) {
            return ExperienceLevel.Warrior;
        } else if(character.xp >= 50 && character.xp < 100) {
            return ExperienceLevel.Champion;
        } else if(character.xp > 100) {
            return ExperienceLevel.Master; 
        }
    }

    function isAlive(Character storage character) internal view returns(bool) {
        return  character.hp > character.damage;
    }

    function canCastFireBall(Character storage character) internal view returns(bool) {
        return (character.lastFireballAttack + 1 days) <= block.timestamp;
    }

    function isMaster(Character storage character) internal view returns(bool) {
         return experience(character) == ExperienceLevel.Master;
    }

    function isChampion(Character storage character) internal view returns(bool) {
         return experience(character) == ExperienceLevel.Champion;
    }

    function isHealer(Character storage character) internal view returns(bool) {
         return isChampion(character) || isMaster(character);
    }
}