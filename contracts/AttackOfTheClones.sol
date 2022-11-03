//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/MinimalForwarder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "./CryptopunksDataInterface.sol";
import "./lib/Character.sol";
import "./lib/Boss.sol";
import { IRewardNft } from "./tokens/RewardNft.sol";

contract AttackOfTheClones is ERC2771Context, VRFConsumerBaseV2, ConfirmedOwner{

    using CharacterLib for Character;
    using BossLib for Boss;

     struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
        address sender;
    }

    VRFCoordinatorV2Interface public COORDINATOR;
    IERC20 public xpToken;
    CryptopunksDataInterface public cryptoPunks;
    IRewardNft public rewardNft;

    uint32 callbackGasLimit = 200000;
    uint64 vrfSubscriptionId;
    uint256 public currentBoss;
    uint256 public charactersCount;
    uint256 constant public  maxBosses = 10000; // maxmum amount of bosses that can be generated (same of cryptopunks)
    uint256 public healthPoints; 
    uint256 public maxHealthPoints; 
    uint256 public regularDamagePoints; //damage caused by a regular attack
    uint256 public fireballDamagePoints; //damage caused by a fireball attack
    uint256 public bossesToGenerate; // amount of bosses to generate
    bytes32 public vrfKeyHash = 0x4b09e658ed251bcafeebbc69400383d49f344ace09b9576fe248bb02c003fe9f;
    Boss[] public bosses;

    mapping(address => Character) public characters;
    mapping(address => mapping(uint256 => uint256)) public claimableExperience;// points for hitting boss
    mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */

    event BossesPopulated(uint256 totalBosses);
    event RequestSent(uint256 requestId, uint32 numWords);
    event ReceivedRandomness(uint256 requestId, uint256[] randomWords);
    event CharacterGenerated(uint256 height);
    event AttackExecuted(uint256 xp);
    event BossInvoked(uint256 bossIndex);
    event CharacterHealed(address character);
    event RewardsClaimed(uint256 amount, uint256 tokenId );

    constructor(
    IERC20 _xpToken, 
    IRewardNft _rewardNft, 
    address _cryptoPunks, 
    MinimalForwarder forwarder, 
    address _vrfCoordinator,
    uint64 _vrfSubscriptionId) 
       ERC2771Context(address(forwarder)) 
       ConfirmedOwner(_msgSender())
       VRFConsumerBaseV2(_vrfCoordinator) {
        healthPoints = 100;
        maxHealthPoints = 1000;
        regularDamagePoints = 5;
        fireballDamagePoints = 10;

        cryptoPunks = CryptopunksDataInterface(_cryptoPunks);
        xpToken = _xpToken;
        rewardNft = _rewardNft;
        bossesToGenerate = 10;
        vrfSubscriptionId = _vrfSubscriptionId;
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
    }

    function generateCharacter() external {
        require(characters[_msgSender()].active == false, "Character exists for this address");
        requestRandomWords();
    }

    /**
     * @notice called by chainlink vrf cordinator to complete the creation of a new character
     * @param height ramdomly generated address of the new character  
     * @param belongsTo the address that initiated the request
     */
    function completeGenerateCharacter(uint256 height, address belongsTo) private {
        require(characters[belongsTo].active == false, "Character exists for this address");
        characters[belongsTo] = Character({
            hp: healthPoints,
            damage: 0,
            xp:0,
            lastFireballAttack: 0,
            active: true,
            height: height
        });
        emit CharacterGenerated(height);
    }


    /**
     * @notice called by master or champion character to heal a dead character
     * @param characterToHeal address of the character to heal
     */
    function healCharacter(address characterToHeal) external {
        require(characters[_msgSender()].isAlive(), "character is not active, cannot heal");
        require(_msgSender() != characterToHeal, "You cannot heal yourself");
        require(characters[_msgSender()].isHealer(), "Only a Champion or Master can heal");
        characters[characterToHeal].damage = 0; 
        emit CharacterHealed(characterToHeal);
    }

    /**
     * @notice executes a regular attack
     */
    function regularAttack() external {
        require(bosses[currentBoss].active == true, "No Boss to attack");
        require(characters[_msgSender()].isAlive(), "Character is not active, cannot attack");
        _attack(_msgSender(), regularDamagePoints);
    }

    /**
     * @dev executes a firball attack only callable by character with master or champion level
     */
    function fireballAttack() external {
        require(bosses[currentBoss].active == true, "No Boss to attack");
        require(characters[_msgSender()].isAlive(), "Character is not active, cannot attack"); 
        require(characters[_msgSender()].isMaster(), "Only a Master (Level 3) can cast fireball");
        require(characters[_msgSender()].canCastFireBall(), "Must wait 24 hours to cast fireball");
         characters[_msgSender()].lastFireballAttack = block.timestamp;
        _attack(_msgSender(), fireballDamagePoints);
    }

    function _attack(address _character, uint256 damage) private {
         Character storage character = characters[_character]; 
        // attack boss
        bosses[currentBoss].damage  = bosses[currentBoss].damage +  damage; 
        //counter attack 
        characters[_character].damage =  characters[_character].damage  + damage;
        // increment players total experience
        characters[_character].xp =  characters[_character].xp + damage;
        // increment players claimable experience
        uint256 xp = claimableExperience[_character][currentBoss];
        claimableExperience[_character][currentBoss] = xp + damage;
         // character looses experience if dead
        if(character.isAlive() == false) {
            character.xp = 0;
        }
        // if current boss is dead, begin next boss
        if(bosses[currentBoss].isAlive() == false && bosses.length < maxBosses) {
            bosses[currentBoss].active = false;
            ++currentBoss;
            bosses[currentBoss].active = true;
        }
        emit AttackExecuted(character.xp);
    }

    /**
     * @notice called by characters to claim rewards they earned by participating in attacking a boss
     * @param boss the boss which was attacked and killed  
     */
    function claimRewards(uint256 boss) external { 
        require(bosses[boss].isAlive() == false, "Boss is not defeated yet");
        require(claimableExperience[_msgSender()][boss] > 0, "You do not have claimable experience");
        uint256 amount =  claimableExperience[_msgSender()][boss];
        claimableExperience[_msgSender()][boss] = 0;
        xpToken.transfer(_msgSender(), amount);
        uint256 tokenId = rewardNft.mint(_msgSender(), cryptoPunks.punkImageSvg(bosses[boss].punkIndex));
       emit RewardsClaimed(amount,tokenId );
    }

    /**
     * @notice cpopulated bosses
     * @param bossHealthPoints health points tp be assigned to the new bosses 
     */
    function populateBosses( uint256 bossHealthPoints) external onlyOwner() {
        require(bosses.length < maxBosses, "Max bosses reached");
        require(bossHealthPoints >= healthPoints && bossHealthPoints <= maxHealthPoints, "Invalid health points");
        uint256 _bossesToGenerate = bossesToGenerate;
        if(maxBosses - bosses.length < bossesToGenerate) {
            _bossesToGenerate = maxBosses - bosses.length ;
        }
        uint256 count = bosses.length;
        for(uint256 i = count; i < count + _bossesToGenerate; i++) {
            bosses.push(
                Boss({
                    hp: bossHealthPoints,
                    damage: 0,
                    reward: bossHealthPoints, 
                    punkIndex: uint16(i),
                    active: false
                })
            );
        }
        emit BossesPopulated(bosses.length);
    }

    /**
     * @notice loads a new currentBoss once the old boss is defeated. 
     * @dev used to initialize the currentBoss at the start of the games 
     */
    function invokeBoss() external onlyOwner() {
        require(bosses[currentBoss].active == false, "cannot invoke boss, current boss is still active");
        if(currentBoss !=0) {
            ++currentBoss;
         }  
        bosses[currentBoss].active = true;
        emit BossInvoked(currentBoss);
    }

    
    /**
     * @notice  sets teh amount of damage caused by a regular attack
     */
    function setRegularDamagePoints(uint256 _regularDamagePoints) external onlyOwner{
        regularDamagePoints = _regularDamagePoints;
    }

    /**
     * @notice  sets teh amount of damage caused by a fireball attack
     */
    function setFireballDamagePoints(uint256 _fireballDamagePoints) external onlyOwner{
        fireballDamagePoints = _fireballDamagePoints;
    }

    function getBossesCount() external view returns(uint256){
        return bosses.length;
    }

    function isCharacterAlive(address character) external view returns(bool){
        return characters[character].isAlive();
    }

    function isBossAlive(uint256 bossIndex) external view returns(bool){
        return bosses[bossIndex].isAlive();
    }

    function isCurrentBossAlive() external view returns(bool){
        return bosses[currentBoss].isAlive();
    }

    function punkImage(uint16 index) external view returns (bytes memory) {
        return cryptoPunks.punkImage(index);
    }

    /**
     * The Cryptopunk image for the given index, in SVG format.
     * In the SVG, each "pixel" is represented as a 1x1 rectangle.
     * @param index the punk index, 0 <= index < 10000
     */
    function punkImageSvg(uint16 index) external view returns (string memory svg) {
        return cryptoPunks.punkImageSvg(index);
    }

    /**
     * The Cryptopunk attributes for the given index.
     * The attributes are a comma-separated list in UTF-8 string format.
     * The first entry listed is not technically an attribute, but the "head type" of the Cryptopunk.
     * @param index the punk index, 0 <= index < 10000
     */
    function punkAttributes(uint16 index) external view returns (string memory text) {
        return cryptoPunks.punkAttributes(index);
    }


    // Assumes the subscription is funded sufficiently.
    function requestRandomWords() private  returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = COORDINATOR.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            3, //requestConfirmations,
            callbackGasLimit,
            1//numWords
        );
        s_requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false, sender: _msgSender()});
        emit RequestSent(requestId, 1);
        return requestId;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        require(s_requests[requestId].exists, 'request not found');
        s_requests[requestId].fulfilled = true;
        s_requests[requestId].randomWords = randomWords;
       completeGenerateCharacter(randomWords[0], s_requests[requestId].sender);
       charactersCount = charactersCount +1;
        emit ReceivedRandomness(requestId, randomWords);
    }
 
}
