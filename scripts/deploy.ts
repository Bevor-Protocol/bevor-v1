import { ethers } from "hardhat";

async function main() {
  const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  const unlockTime = currentTimestampInSeconds + 60;

  //const lockedAmount = ethers.parseEther("0.001");

  // const lock = await ethers.deployContract("Lock", [unlockTime], {
  //   value: lockedAmount,
  // });

  const ERC20Token = ethers.deployContract("ERC20Token");
  const Audit = ethers.deployContract("Audit");
  const AuditPayment = ethers.deployContract("AuditPayment");
  const BevorDAO = ethers.deployContract("BevorDAO");
  const TimelockController = ethers.deployContract("TimelockController");

  await ERC20Token.waitForDeployment();
  await Audit.waitForDeployment();
  await AuditPayment.waitForDeployment();
  await BevorDAO.waitForDeployment();
  await TimelockController.waitForDeployment();

  // console.log(
  //   `Lock with ${ethers.formatEther(
  //     lockedAmount
  //   )}ETH and unlock timestamp ${unlockTime} deployed to ${lock.target}`
  // );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// const ERC20Token = artifacts.require("ERC20Token");
// const Audit = artifacts.require("Audit");
// const AuditPayment = artifacts.require("AuditPayment");
// const BevorDAO = artifacts.require("BevorDAO");
// const TimelockController = artifacts.require("TimelockController");


// module.exports = async function(deployer) {
//   let bvrAddr;
//   const name = "Bevor Token";
//   const symbol = "BVR";

//   let usdAddr;
//   const name1 = "Test USD Token";
//   const symbol1 = "TUSD";

//   let nftAddr;
//   let daoAddr;
//   let payAddr;
//   let timelockAddr;

//   await deployer.deploy(ERC20Token, 1000000, name, symbol).then(c => bvrAddr = c.address);
//   await deployer.deploy(ERC20Token, 1000000, name1, symbol1).then(c => usdAddr = c.address);
//   await deployer.deploy(Audit).then(c => nftAddr = c.address);
//   await deployer.deploy(TimelockController, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19").then(c => timelockAddr = c.address);
//   await deployer.deploy(BevorDAO, bvrAddr, timelockAddr).then(c => daoAddr = c.address);
//   await deployer.deploy(AuditPayment, daoAddr, nftAddr).then(c => payAddr = c.address);
// };