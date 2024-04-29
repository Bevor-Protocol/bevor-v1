import { ethers } from "hardhat";

async function main() {

  const totalSupply = 1000000;

  const Token = await ethers.getContractFactory("ERC20Token");
  const TL = await ethers.getContractFactory("BevorTimelockController");
  const DAOProxy = await ethers.getContractFactory("DAOProxy");
  const Audit = await ethers.getContractFactory("Audit");
  const TokenVestingMock = await ethers.getContractFactory("MockAuditPayment");
  const TokenVesting = await ethers.getContractFactory("AuditPayment");

  const testToken = await Token.deploy(totalSupply, "Test Token", "TT");
  await testToken.waitForDeployment();
  
  const timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
  await timelock.waitForDeployment();

  //const bevorDAO = await DAO.deploy(testToken.getAddress(), timelock.getAddress());
  //await bevorDAO.waitForDeployment();

  const daoProxy = await DAOProxy.deploy();
  await daoProxy.waitForDeployment();

  const auditNFT = await Audit.deploy();
  await auditNFT.waitForDeployment();

  const tokenVestingMock = await TokenVestingMock.deploy(daoProxy.getAddress(), auditNFT.getAddress());
  await tokenVestingMock.waitForDeployment();

  const tokenVesting = await TokenVesting.deploy(daoProxy.getAddress(), auditNFT.getAddress());
  await tokenVesting.waitForDeployment();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
