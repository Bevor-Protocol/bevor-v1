import { ethers } from "hardhat";

async function main() {

  const totalSupply = 1_000_000;
  const totalSupplyCorrected = ethers.parseUnits(totalSupply.toString(), 18);

  const Token = await ethers.getContractFactory("ERC20Token");
  const TL = await ethers.getContractFactory("BevorTimelockController");
  const DAOProxy = await ethers.getContractFactory("DAOProxy");
  const Audit = await ethers.getContractFactory("Audit");
  const BevorProtocol = await ethers.getContractFactory("BevorProtocol");

  const testToken = await Token.deploy(totalSupplyCorrected, "Test Token", "TT");
  await testToken.waitForDeployment();
  
  const timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
  await timelock.waitForDeployment();

  //const bevorDAO = await DAO.deploy(testToken.getAddress(), timelock.getAddress());
  //await bevorDAO.waitForDeployment();

  const daoProxy = await DAOProxy.deploy();
  await daoProxy.waitForDeployment();

  const auditNFT = await Audit.deploy();
  await auditNFT.waitForDeployment();

  const bevorProtocol = await BevorProtocol.deploy(daoProxy.getAddress(), auditNFT.getAddress());
  await bevorProtocol.waitForDeployment();

  await auditNFT.transferOwnership(await bevorProtocol.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
