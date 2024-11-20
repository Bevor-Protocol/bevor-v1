import { ethers } from "hardhat";

async function main() {

  const totalSupply = 1_000_000;
  const totalSupplyUnits = ethers.parseUnits(totalSupply.toString(), 18);

  const Token = await ethers.getContractFactory("BevorToken");
  const ManualDAO = await ethers.getContractFactory("ManualDAO");
  const Audit = await ethers.getContractFactory("Audit");
  const BevorProtocol = await ethers.getContractFactory("BevorProtocol");

  const testToken = await Token.deploy(totalSupplyUnits, "Test Token", "TT");
  await testToken.waitForDeployment();

  const manualDao = await ManualDAO.deploy();
  await manualDao.waitForDeployment();

  const auditNFT = await Audit.deploy();
  await auditNFT.waitForDeployment();

  const bevorProtocol = await BevorProtocol.deploy(manualDao.getAddress(), auditNFT.getAddress());
  await bevorProtocol.waitForDeployment();

  await manualDao.setBevorProtocol(bevorProtocol.getAddress());

  await auditNFT.transferOwnership(bevorProtocol.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
