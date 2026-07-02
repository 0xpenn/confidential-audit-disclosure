import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // deployer becomes owner — approve/reject gated behind msg.sender === owner
  const deployed = await deploy("AuditDisclosure", {
    from: deployer,
    log: true,
  });

  console.log(`AuditDisclosure deployed at: `, deployed.address);
};

export default func;
func.id = "deploy_auditDisclosure"; // prevents re-execution on subsequent deploys
func.tags = ["AuditDisclosure"];
