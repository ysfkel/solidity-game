const { network } = require("hardhat")
const { verify } = require("../utils/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const deployed_contract = await deploy("RewardNft", {
        from: deployer,
        log: true,
        args:[]
    }) 

    // verify if not dev chain
    if(network.config.chainId!=31337) {
        await verify(deployed_contract.address, [])
    }

}
module.exports.tags = ["reward"]
