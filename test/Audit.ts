import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("AuditNFT Functionality", function () {
  let Token: any;
  let DAO: any;
  let TL: any;
  let Audit: any;
  let testToken: any;
  let timelock: any;
  let bevorDAO: any;
  let auditNFT: any;
  let TokenVesting: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addrs: any;
  const totalSupply = BigInt(1000000);

  before(async function () {
    Token = await ethers.getContractFactory("ERC20Token");
    TL = await ethers.getContractFactory("BevorTimelockController");
    DAO = await ethers.getContractFactory("BevorDAO");
    Audit = await ethers.getContractFactory("Audit");
    TokenVesting = await ethers.getContractFactory("MockAuditPayment");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    testToken = await Token.deploy(totalSupply, "Test Token", "TT");
    await testToken.waitForDeployment();
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    bevorDAO = await DAO.deploy(testToken.getAddress(), timelock.getAddress());
    await bevorDAO.waitForDeployment();
    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();
  });

  describe("AuditNFT", function () {
    it('Trustless handoff should change to reveal URI', async () => {
        //Switches to https://ipfs.io/ipfs/ from https://api.bevor.io/ upon reveal
        const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
        await tokenVesting.waitForDeployment();

        const baseTime = 1622551248;
        const beneficiary = addr1;
        const startTime = baseTime;
        const cliff = 0;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;

        await testToken.approve(tokenVesting.getAddress(), 1000);
        await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

        await auditNFT.mint(addr1);

        expect(await auditNFT.tokenURI(1)).to.equal('https://api.bevor.io/1');

        await auditNFT.connect(addr1).trustlessHandoff(addr1, owner, 1);

        expect(await auditNFT.tokenURI(1)).to.equal('https://ipfs.io/ipfs/1');
    });

    it('Audit should change hands after trustless handoff', async () => {
        //Test this trustlessHandoff(address from, address to, uint256 tokenId)
        const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
        await tokenVesting.waitForDeployment();

        const baseTime = 1622551248;
        const beneficiary = addr1;
        const startTime = baseTime;
        const cliff = 0;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;

        await testToken.approve(tokenVesting.getAddress(), 1000);
        await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

        await auditNFT.mint(addr1);

        await auditNFT.connect(addr1).trustlessHandoff(addr1, owner, 1);

        expect(await auditNFT.ownerOf(1)).to.equal(await owner.getAddress());
    });

    it('Trustless handoff should only be triggerable by auditor or by vesting contract', async () => {
        //Test all the rejection and acceptance cases `
        const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
        await tokenVesting.waitForDeployment();

        const baseTime = 1622551248;
        const beneficiary = addr1;
        const startTime = baseTime;
        const cliff = 0;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;

        await testToken.approve(tokenVesting.getAddress(), 1000);
        await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

        await auditNFT.mint(addr1);

        expect(auditNFT.connect(owner).trustlessHandoff(addr1, owner, 1)).to.be.revertedWith("ERC721: transfer from incorrect owner");

        //Add other test cases here as they arise
    });
  });

});