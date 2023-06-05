var ViridianToken = artifacts.require("ERC20TokenGasless");
var ViridianNFT = artifacts.require("ViridianNFT");
var ViridianPack = artifacts.require("ViridianPack");
var ViridianExchange = artifacts.require("ViridianExchange");
var ViridianExchangeOffers = artifacts.require("ViridianExchangeOffers");
var RandomNumber = artifacts.require("RandomNumberConsumer");
//var ViridianPass = artifacts.require("ViridianPass");


module.exports = async function(deployer) {
  let tokenAddr;
  let forwarderAddress = '0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b';
  let passForwarderAddress = '0xFD4973FeB2031D4409fB57afEE5dF2051b171104';
  let treasuryAddress = '0x341Ab3097C45588AF509db745cE0823722E5Fb19';
  let nftAddr;
  let excAddr;
  let excOffAddr;
  let packAddr;
  let vrfAddr;
  let passAddr;
  await deployer.deploy(ViridianToken, forwarderAddress).then(c => tokenAddr = c.address);
  await deployer.deploy(ViridianNFT, forwarderAddress).then(c => nftAddr = c.address);
  await deployer.deploy(ViridianPack, nftAddr, forwarderAddress).then(c => packAddr = c.address);
  await deployer.deploy(ViridianExchange, tokenAddr, nftAddr, packAddr, forwarderAddress, treasuryAddress).then(c => excAddr = c.address);
  await deployer.deploy(ViridianExchangeOffers, tokenAddr, nftAddr, packAddr, forwarderAddress, treasuryAddress).then(c => excOffAddr = c.address);
  await deployer.deploy(RandomNumber, packAddr, forwarderAddress).then(c => vrfAddr = c.address);
  //await deployer.deploy(ViridianPass, 'https://d4xub33rt3s5u.cloudfront.net/v1ep.json', passForwarderAddress, treasuryAddress).then(c => passAddr = c.address);
};