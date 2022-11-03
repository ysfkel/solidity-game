const { network } = require("hardhat")
const { verify } = require("../utils/verify")

module.exports = async ({ ethers, getNamedAccounts, deployments }) => {
    const XpAbi = require('../artifacts/contracts/tokens/XpToken.sol/XpToken.json').abi;
    const rewardAbi = require('../artifacts/contracts/tokens/RewardNft.sol/RewardNft.json').abi
    
    const { chainId} = network.config;
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const reward = await ethers.getContract("RewardNft")
    const xp = await ethers.getContract("XpToken")

    let cp;
    let vrf;
    if(chainId === 31337 || process.env.CRYPTOPUNKS_DATA) {
        cp = await deploy("MockCryptoPunksData", {
            from: deployer,
            log: true,
            args:[]
        }) 
    }

    if(chainId ===31337 || process.env.VRF_COORDINATOR_V2) {
        vrf = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args:[
                100000, // base fee
                100000 // gas price link
            ]
        })     
    } else {
        cp = process.env.CRYPTOPUNKS_DATA;
        vrf = process.env.VRF_COORDINATOR_V2;
    }

    const deployed_contract = await deploy("AttackOfTheClones", {
        from: deployer,
        log: true,
        args:[
            xp.address,
            reward.address,
            cp.address,
            xp.address, // fake forwarder
            vrf.address,
            1// subscritption id
        ]
    }) 

    const signer = await ethers.getSigner(deployer);
    const xp_contract = new ethers.Contract(xp.address, XpAbi, ethers.provider);
    const reward_contract = new ethers.Contract(reward.address, rewardAbi, ethers.provider);

    const balance = await  xp_contract.balanceOf(deployer);
    await xp_contract.connect(signer).transfer(deployed_contract.address, balance)
    await reward_contract.connect(signer).transferOwnership(deployed_contract.address)
    
    // verify if not dev chain
    if(chainId!=31337) {
        await verify(deployed_contract.address, [
            xp.address,
            reward.address,
            cp.address,
            xp.address // fake forwarder
        ])
    }

}
module.exports.tags = ["attack-of-the-clones"]
module.exports.dependencies = ["xp", "reward"]
