const { network } = require("hardhat")
const { verify } = require("./utils/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
    // vdeploy 
    if(chain==31337) {
        const { deploy, log } = deployments
        const { deployer } = await getNamedAccounts()
    
        const deployed_contract = await deploy("MockCryptoPunksData", {
            from: deployer,
            log: true,
            args:[]
        }) 
    }
}
module.exports.tags = ["cp"]
