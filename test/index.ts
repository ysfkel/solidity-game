import { expect } from "chai";
import { ethers } from "hardhat";

describe("Test game", function () {

    before('LoadFactories', async function() {
      const signers = await ethers.getSigners()
      this.deployer = signers[0] 
      this.user = signers[1] 
      this.secondUser = signers[2] 
      this.CryptoPunksData = await ethers.getContractFactory("MockCryptoPunksData")
      this.RewardNft = await ethers.getContractFactory("RewardNft");
      this.XpToken = await ethers.getContractFactory("XpToken");
      this.Game = await ethers.getContractFactory("AttackOfTheClones");
      this.VRF = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    })

    beforeEach(async function () {
      this.cp = await this.CryptoPunksData.deploy();
      await this.cp.deployed();
      this.xp = await this.XpToken.deploy();
      await this.xp.deployed();
      this.rw = await this.RewardNft.deploy();
      await this.rw.deployed();
      this.vrf = await this.VRF.deploy(0,0);
      await this.vrf.deployed();

      const subscriptionTx = await this.vrf.createSubscription();
      let tx = await ethers.provider.getTransactionReceipt(subscriptionTx.hash);
      let subId = ethers.utils.defaultAbiCoder.decode(['uint256'],tx.logs[0].topics[1])
      this.subId = subId.toString()
      //we have to fund the subscription to be able to request random words
      await this.vrf.fundSubscription(this.subId, ethers.utils.parseEther('100'));
      this.game = await this.Game.deploy(
        this.xp.address,
        this.rw.address,
        this.cp.address,
        this.xp.address, // fake forwader
        this.vrf.address,
        this.subId
      );
      await this.game.deployed();
      await this.vrf.addConsumer(this.subId, this.game.address)
      await this.rw.transferOwnership(this.game.address);
      await this.xp.transfer(this.game.address, await this.xp.balanceOf(this.deployer.address));
   })



  it('should set constructor arguments', async function(){
  
    expect(await this.game.cryptoPunks()).to.equal(this.cp.address);
    expect(await this.game.xpToken()).to.equal(this.xp.address);
    expect(await this.game.rewardNft()).to.equal(this.rw.address);
    expect(await this.game.COORDINATOR()).to.equal(this.vrf.address);
  })

  it('should revert with Caller is not Owner', async function() {
    await expect(this.game.connect(this.user).populateBosses(2000)).to.be.revertedWith('Only callable by owner')
  })

  it('should revert with Caller is not Owner', async function() {
    await expect(this.game.populateBosses(2000)).to.be.revertedWith('Invalid health points')
  })

  it('should populate bosses', async function() {
    const bossesToGenerate = await this.game.bossesToGenerate();
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated").withArgs(bossesToGenerate);
    const boosesCount = await this.game.getBossesCount();
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated").withArgs(boosesCount.add(bossesToGenerate));
  })

  it('should generate character', async function() {
   let tx = await this.game.connect(this.deployer).generateCharacter()
   let { events } = await tx.wait();
   await expect(tx).to.emit(this.game, 'RequestSent')
   let [requestId, invoker] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
   tx = await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
   await expect(tx).to.emit(this.game, "ReceivedRandomness")
   expect((await this.game.characters(this.deployer.address)).active).equal(true)
  })

  it('should revert with Character exists for this address', async function() {
    let tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
     await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
     await expect(this.game.connect(this.deployer).generateCharacter()).to.revertedWith('Character exists for this address')
   })


  it('should revert with No Boss to attack', async function() {
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0)
    await expect(this.game.invokeBoss()).to.revertedWith("cannot invoke boss, current boss is still active")
  })

  it('should invoke boss', async function() {
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
  })

  it('should revert with No Boss to attack', async function() {
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.regularAttack()).to.revertedWith("No Boss to attack")
  })

  it('should revert with Character is not active, cannot attack ', async function() {
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    await expect(this.game.regularAttack()).to.revertedWith('Character is not active, cannot attack')
  })

  it('should attack successfully', async function() {
    const tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.game.setRegularDamagePoints(50);
    await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    // firstattack
    const regularDamagePoints = await this.game.regularDamagePoints();
    let character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(regularDamagePoints)
    expect(character.damage).to.equal(regularDamagePoints)
  })

  it('should die when damage equals health points ', async function() {
    const tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
    await this.game.setRegularDamagePoints(50);
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    // firstattack
    const regularDamagePoints = await this.game.regularDamagePoints();
    let character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(regularDamagePoints)
    expect(character.damage).to.equal(regularDamagePoints)
    // //second attack
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(0) // characher is dead
    expect(character.damage).to.equal(100)
    await expect(this.game.regularAttack()).to.revertedWith('Character is not active, cannot attack');
    const currentBoss = await this.game.currentBoss()
    expect(currentBoss).to.equal(0);
    const boss = await this.game.bosses(currentBoss)
    expect(boss.damage).to.equal(regularDamagePoints.add(regularDamagePoints));
  })

  it('should revert with Only a Champion or Master can heal another character', async function() {
    // generate first character
    let tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
    // generate second character
     tx = await this.game.connect(this.user).generateCharacter()
    let  res = await tx.wait();
    let [_requestId, ] = res.events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(_requestId.toString(), this.game.address);
    //
    await this.game.setRegularDamagePoints(50);
    //populate bosses
    await expect(this.game.populateBosses(200)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    // firstattack
    const regularDamagePoints = await this.game.regularDamagePoints();
    let character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(regularDamagePoints)
    expect(character.damage).to.equal(regularDamagePoints)
    // //second attack
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(0) // characher is dead
    expect(character.damage).to.equal(100)
    await expect(this.game.regularAttack()).to.revertedWith('Character is not active, cannot attack');
    // heal first character
    await expect(this.game.connect(this.user).healCharacter(this.deployer.address)).to.revertedWith('Only a Champion or Master can heal');
  })

  it('should heal dead character successfully', async function() {
    // generate first character
    let tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
    // generate second character
     tx = await this.game.connect(this.user).generateCharacter()
    let  res = await tx.wait();
    let [_requestId, ] = res.events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(_requestId.toString(), this.game.address);
    //
    await this.game.setRegularDamagePoints(50);
    //populate bosses
    await expect(this.game.populateBosses(200)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    // firstattack
    const regularDamagePoints = await this.game.regularDamagePoints();
    let character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(regularDamagePoints)
    expect(character.damage).to.equal(regularDamagePoints)
    // //second attack
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(0) // characher is dead
    expect(await this.game.isCharacterAlive(this.deployer.address)).to.equal(false)
    expect(character.damage).to.equal(100)
    await expect(this.game.regularAttack()).to.revertedWith('Character is not active, cannot attack');
    // heal first character
    await expect(this.game.connect(this.user).regularAttack()).to.emit(this.game,'AttackExecuted');
    await expect(this.game.connect(this.user).healCharacter(this.deployer.address)).to.emit(this.game, 'CharacterHealed').withArgs(this.deployer.address);
    // healed character should be acctive 
    character = await this.game.characters(this.deployer.address)
    expect(character.xp).to.equal(0) // characher is dead
    expect(character.damage).to.equal(0)
    expect(await this.game.isCharacterAlive(this.deployer.address)).to.equal(true)
  })

  it('should killboss and claim reward', async function() {
    await this.game.setRegularDamagePoints(50);
    const regularDamagePoints = await this.game.regularDamagePoints();
    // generate first character
    let tx = await this.game.connect(this.deployer).generateCharacter()
    let { events } = await tx.wait();
    let [requestId, ] = events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(requestId.toString(), this.game.address);
    // generate second character
     tx = await this.game.connect(this.user).generateCharacter()
    let  res = await tx.wait();
    let [_requestId, ] = res.events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(_requestId.toString(), this.game.address);
    // generate third character
    tx = await this.game.connect(this.secondUser).generateCharacter()
    res = await tx.wait();
    let [__requestId, ] = res.events.filter((x:any) => x.event === 'RequestSent')[0].args;
    await this.vrf.fulfillRandomWords(__requestId.toString(), this.game.address);
    //populate bosses
    await expect(this.game.populateBosses(150)).to.emit(this.game,"BossesPopulated")
    await expect(this.game.invokeBoss()).to.emit(this.game,"BossInvoked").withArgs(0) 
    // first attack
    await expect(this.game.regularAttack()).to.emit(this.game,'AttackExecuted');
    //second attack
    await expect(this.game.connect(this.user).regularAttack()).to.emit(this.game,'AttackExecuted');
    // third attack
    await expect(this.game.connect(this.secondUser).regularAttack()).to.emit(this.game,'AttackExecuted');
    // check boss is dead
    const currentBoss = await this.game.currentBoss();
    const boss = await this.game.bosses(0)
    expect(boss.damage).to.equal(150)
    expect(await this.game.isBossAlive(0)).to.equal(false);
    // claim rewards 
    await expect(this.game.claimRewards(0)).to.emit(this.game, 'RewardsClaimed');
    await expect(this.game.connect(this.user).claimRewards(0)).to.emit(this.game, 'RewardsClaimed');
    await expect(this.game.connect(this.secondUser).claimRewards(0)).to.emit(this.game, 'RewardsClaimed');
    // check xp balance
    expect(await this.xp.balanceOf(this.deployer.address)).to.equal(50)
    expect(await this.xp.balanceOf(this.user.address)).to.equal(50)
    expect(await this.xp.balanceOf(this.secondUser.address)).to.equal(50)
    // check nft
    expect(await this.rw.balanceOf(this.deployer.address)).to.equal(1)
    expect(await this.rw.balanceOf(this.user.address)).to.equal(1)
    expect(await this.rw.balanceOf(this.secondUser.address)).to.equal(1)
  })
});
