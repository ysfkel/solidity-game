const { network } = require("hardhat")
const { verify } = require("../utils/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const deployed_contract = await deploy("VRFCoordinatorV2Mock", {
        from: deployer,
        log: true,
        args:[
            100000, // base fee
            100000 // gas price link
        ]
    }) 
  
    // verify if not dev chain
  if(chain!=31337) {
    await verify(deployed_contract.address, [])
   }
}
module.exports.tags = ["vrf"]
