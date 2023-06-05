const Migrations = artifacts.require("ERC20TokenGasless");
const Migrations1 = artifacts.require("ViridianNFT");
const Migrations2 = artifacts.require("ViridianPack");
const Migrations3 = artifacts.require("ViridianExchange");
const Migrations4 = artifacts.require("ViridianExchangeOffers");
const Migrations5 = artifacts.require("RandomNumberConsumer");
//const Migrations6 = artifacts.require("ViridianPass");

module.exports = async function (deployer) {
  let forwarderAddress = '0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b';
  await deployer.deploy(Migrations, forwarderAddress);
  await deployer.deploy(Migrations1, forwarderAddress);
  await deployer.deploy(Migrations2, Migrations1.address, forwarderAddress);

  await deployer.deploy(Migrations3, Migrations.address, Migrations1.address, Migrations2.address, forwarderAddress, '0x341Ab3097C45588AF509db745cE0823722E5Fb19');
  await deployer.deploy(Migrations4, Migrations.address, Migrations1.address, Migrations2.address, forwarderAddress, '0x341Ab3097C45588AF509db745cE0823722E5Fb19');
  await deployer.deploy(Migrations5, Migrations2.address, forwarderAddress);
  //await deployer.deploy(Migrations6, 'https://d4xub33rt3s5u.cloudfront.net/v1ep.json', '0xFD4973FeB2031D4409fB57afEE5dF2051b171104', '0x341Ab3097C45588AF509db745cE0823722E5Fb19');
};