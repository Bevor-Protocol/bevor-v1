const ERC20Token = artifacts.require("ERC20Token");
const Audit = artifacts.require("Audit");
const AuditPayment = artifacts.require("AuditPayment");
const BevorDAO = artifacts.require("BevorDAO");
const TimelockController = artifacts.require("TimelockController");


module.exports = async function(deployer) {
  let bvrAddr;
  const name = "Bevor Token";
  const symbol = "BVR";

  let usdAddr;
  const name1 = "Test USD Token";
  const symbol1 = "TUSD";

  let nftAddr;
  let daoAddr;
  let payAddr;
  let timelockAddr;

  await deployer.deploy(BevorToken, 1000000, name, symbol).then(c => bvrAddr = c.address);
  await deployer.deploy(BevorToken, 1000000, name1, symbol1).then(c => usdAddr = c.address);
  await deployer.deploy(Audit).then(c => nftAddr = c.address);
  await deployer.deploy(TimelockController).then(c => timelockAddr = c.address);
  await deployer.deploy(BevorDAO, tokenAddr, timelockAddr).then(c => daoAddr = c.address);
  await deployer.deploy(AuditPayment, nftAddr, forwarderAddress).then(c => payAddr = c.address);
};