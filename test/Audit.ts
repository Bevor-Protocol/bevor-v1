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
  let tokenVesting: any;
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
    TokenVesting = await ethers.getContractFactory("AuditPayment");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    testToken = await Token.deploy(totalSupply, "Test Token", "TT");
    await testToken.waitForDeployment();
    
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    
    bevorDAO = await DAO.deploy(testToken.getAddress(), timelock.getAddress());
    await bevorDAO.waitForDeployment();

    tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress());
    await tokenVesting.waitForDeployment();
  });

  describe("AuditNFT", function () {
    it("Audit constructor should update Vesting 'audit' global address, used for fct restrictions", async () => {
      
      auditNFT = await Audit.deploy(await tokenVesting.getAddress());
      await auditNFT.waitForDeployment();

      const auditAddress = await tokenVesting.audit();

      expect(auditAddress).to.equal(await auditNFT.getAddress());
    });
    it("External generateAuditId should match internal createAudit's call", async () => {
      const tokenVestingAddress = await tokenVesting.getAddress()
        
      auditNFT = await Audit.deploy(tokenVestingAddress);
      await auditNFT.waitForDeployment();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];

      const cliff = 10;
      const duration = 1000;
      const slicePeriodSeconds = 1;
      const amount =  100;
      const salt = 5000;
      const details = "some random content";

      await testToken.approve(tokenVestingAddress, 1000);
      // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

      const testTokenAddress = await testToken.getAddress();

      const auditId = await auditNFT.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        slicePeriodSeconds,
        amount,
        testTokenAddress,
        salt
      );

      expect(await auditNFT.connect(auditee).createAudit(
        auditors,
        cliff,
        duration,
        details,
        slicePeriodSeconds,
        amount,
        testTokenAddress,
        salt
      )).to.emit("AuditCreated").withArgs(auditId);

    });

    it("Can't spoof auditId in mint()", async () => {
      const tokenVestingAddress = await tokenVesting.getAddress()
        
      auditNFT = await Audit.deploy(tokenVestingAddress);
      await auditNFT.waitForDeployment();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];

      const cliff = 10;
      const duration = 1000;
      const slicePeriodSeconds = 1;
      const amount =  100;
      const salt = 5000;
      const details = "some random content";

      const testTokenAddress = await testToken.getAddress();

      // create the auditID, but don't create the Audit struct
      const auditId = await auditNFT.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        slicePeriodSeconds,
        amount,
        testTokenAddress,
        salt
      );

      expect(await auditNFT.connect(auditee).mint(
        auditee,
        auditId,
        ["findings1", "findings2"],
        auditors,
        salt
      )).to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'Only the auditee can mint this NFT'");

    })

    it('Trustless handoff should change to reveal URI', async () => {
        //Switches to https://ipfs.io/ipfs/ from https://api.bevor.io/ upon reveal
        const tokenVestingAddress = await tokenVesting.getAddress()
        
        auditNFT = await Audit.deploy(tokenVestingAddress);
        await auditNFT.waitForDeployment();

        const auditee = addr1;
        const auditors = [addrs[0], addrs[1]];

        const cliff = 10;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;
        const salt = 5000;
        const details = "some random content";

        await testToken.approve(tokenVestingAddress, 1000);
        const conBalance = await testToken.balanceOf(owner);
        console.log(conBalance);
        await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

        const testTokenAddress = await testToken.getAddress();

        const auditId = await auditNFT.generateAuditId(
          auditee,
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );

        await auditNFT.connect(auditee).createAudit(
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );
        
        const tokenId = await auditNFT.generateTokenId(
          auditee,
          ["findings1", "findings2"],
          auditId,
          salt,
        );

        await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

        // let tokenId = await auditNFT.generateProof("b", 321);

        expect(await auditNFT.tokenURI(tokenId)).to.equal(`https://api.bevor.io/${tokenId}`);

        await auditNFT.connect(auditee).trustlessHandoff(auditee, owner, tokenId);

        expect(await auditNFT.tokenURI(tokenId)).to.equal(`https://ipfs.io/ipfs/${tokenId}`);
    });

    it('Audit should change hands after trustless handoff', async () => {
        //Test this trustlessHandoff(address from, address to, uint256 tokenId)
        const tokenVestingAddress = await tokenVesting.getAddress()
        
        auditNFT = await Audit.deploy(tokenVestingAddress);
        await auditNFT.waitForDeployment();

        const auditee = addr1;
        const auditors = [addrs[0], addrs[1]];

        const cliff = 10;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;
        const salt = 5000;
        const details = "some random content";

        await testToken.approve(tokenVestingAddress, 1000);
        // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

        const testTokenAddress = await testToken.getAddress();

        const auditId = await auditNFT.generateAuditId(
          auditee,
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );

        await auditNFT.connect(auditee).createAudit(
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );
        
        const tokenId = await auditNFT.generateTokenId(
          auditee,
          ["findings1", "findings2"],
          auditId,
          salt,
        );

        await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

        await auditNFT.connect(auditee).trustlessHandoff(auditee, owner, tokenId);

        expect(await auditNFT.ownerOf(tokenId)).to.equal(await owner.getAddress());
    });

    it('Trustless handoff should only be triggerable by auditor or by vesting contract', async () => {
        //Test all the rejection and acceptance cases `
        const tokenVestingAddress = await tokenVesting.getAddress()
        
        auditNFT = await Audit.deploy(tokenVestingAddress);
        await auditNFT.waitForDeployment();

        const auditee = addr1;
        const auditors = [addrs[0], addrs[1]];

        const cliff = 10;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;
        const salt = 5000;
        const details = "some random content";

        await testToken.approve(tokenVestingAddress, 1000);
        // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

        const testTokenAddress = await testToken.getAddress();

        const auditId = await auditNFT.generateAuditId(
          auditee,
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );

        await auditNFT.connect(auditee).createAudit(
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );
        
        const tokenId = await auditNFT.generateTokenId(
          auditee,
          ["findings1", "findings2"],
          auditId,
          salt,
        );

        await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

        expect(auditNFT.connect(owner).trustlessHandoff(auditee, owner, tokenId)).to.be.revertedWith("ERC721: transfer from incorrect owner");

        //Add other test cases here as they arise
    });

    it("minting should generate vesting schedules", async () => {
        const tokenVestingAddress = await tokenVesting.getAddress()
        
        auditNFT = await Audit.deploy(tokenVestingAddress);
        await auditNFT.waitForDeployment();

        const auditee = addr1;
        const auditors = [addrs[0], addrs[1]];

        const cliff = 10;
        const duration = 1000;
        const slicePeriodSeconds = 1;
        const amount =  100;
        const salt = 5000;
        const details = "some random content";

        await testToken.approve(tokenVestingAddress, 1000);
        // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

        const testTokenAddress = await testToken.getAddress();

        const auditId = await auditNFT.generateAuditId(
          auditee,
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );

        await auditNFT.connect(auditee).createAudit(
          auditors,
          cliff,
          duration,
          details,
          slicePeriodSeconds,
          amount,
          testTokenAddress,
          salt
        );
        
        const tokenId = await auditNFT.generateTokenId(
          auditee,
          ["findings1", "findings2"],
          auditId,
          salt,
        );

        await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);


        expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(2);
    })

    // Add tests to ensure minting cannot happen before audit is created
  });

});
