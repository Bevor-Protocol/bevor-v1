import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("AuditNFT Functionality", function () {
  let Token: any;
  let DAO: any;
  let TL: any;
  let Audit: any;
  let testToken: any;
  let timelock: any;
  let bevorDAO: any;
  let bevorProtocol: any;
  let auditNFT: any;
  let BevorProtocol: any;
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
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    testToken = await Token.deploy(totalSupply, "Test Token", "TT");
    await testToken.waitForDeployment();
    
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    
    bevorDAO = await DAO.deploy(await testToken.getAddress(), await timelock.getAddress());
    await bevorDAO.waitForDeployment();

    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();

    bevorProtocol = await BevorProtocol.deploy(await bevorDAO.getAddress(), await auditNFT.getAddress());
    await bevorProtocol.waitForDeployment();
  });

  describe("AuditNFT", function () {
    it("Audit constructor should transfer ownership to BevorProtocol", async () => {

      await auditNFT.transferOwnership(await bevorProtocol.getAddress());

      const auditOwner = await auditNFT.owner();

      expect(auditOwner).to.equal(await bevorProtocol.getAddress());
    });

    it("Can't call mint directly", async() => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());

      const mockId = await auditNFT.generateProof("some random string", 100000);

      // fails unless await is outside expect?
      await expect(auditNFT.connect(addr1).mint(addr1, mockId)).to.be.revertedWith(
         "Ownable: caller is not the owner"
      );
    });

    it("Can transfer ERC20 from contract to auditee", async () => {
      const auditee = addr1;
      await testToken.transfer(auditee, 10000);

      expect(await testToken.balanceOf(auditee)).to.equal(10000);
    });

    it("Confirm allowance of auditee to send ERC20", async () => {

      // First we send the ERC20 to the auditee
      // Then we need to approve the auditee to send ERC20 to the bevorProtocol
      // Then we can confirm the allowance

      const auditee = addr1;
      const amount = 10000;
      const spender = await bevorProtocol.getAddress();
      await testToken.transfer(auditee, amount + 10);
      await testToken.connect(auditee).approve(spender, amount);

      expect(await testToken.allowance(auditee, spender)).to.equal(amount);
    });

    it("Confirm ability to transfer ERC20 from audit to bevorProtocol", async () => {

      // First we send the ERC20 to the auditee
      // Then we need to approve the auditee to send ERC20 to the bevorProtocol
      // Then we can confirm the allowance

      const auditee = addr1;
      const amount = 10000;
      const spender = await bevorProtocol.getAddress();

      await testToken.transfer(auditee, amount + 10);
      await testToken.connect(auditee).approve(auditee, amount);
      await testToken.connect(auditee).transferFrom(auditee, spender, amount);
      expect(await testToken.balanceOf(spender)).to.be.at.least(amount);
    });

    // following include some redundancy, but can't use reveal() unless minting occured
    it("Able to generate auditId", async () => {

      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      expect(auditId).to.exist;
    });

    it("Bevor Protocol prepares audit, matching externally called auditId", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      // have to move the await back inside the expect()
      expect(await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )).to.emit("AuditCreated").withArgs(auditId);

      expect(await bevorProtocol.getVestingSchedulesCount()).to.equal(auditors.length);
    });

    it("Able to generate tokenId", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      expect(tokenId).to.exist;

    });

    it("Bevor Protocol revealFindings() fails without token balance", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )

      await expect(bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )).to.be.revertedWith("ERC20: insufficient allowance");

    });

    it("Bevor Protocol can call mint() from Audit.sol contract after approval", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )

      // start time should be zero
      expect((await bevorProtocol.audits(auditId))[5]).to.equal(0);
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      const now = Math.round(new Date().getTime() / 1000);

      await bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )

      expect((await bevorProtocol.audits(auditId))[5]).to.be.greaterThan(now);
      
      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);
      expect(await auditNFT.tokenOfOwnerByIndex(auditee, 0)).to.equal(tokenId);
    });

    it("Can't spoof auditId in mint()", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )

      // start time should be zero
      expect((await bevorProtocol.audits(auditId))[5]).to.equal(0);
      
      const randomId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);

      await expect(bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        randomId,
      )).to.be.revertedWith("Only the auditee can mint this NFT");
    })

    it("Validate that vesting behavior works as expected", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )

      // start time should be zero
      expect((await bevorProtocol.audits(auditId))[5]).to.equal(0);
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      await bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )
      
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];

      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      // mines a new block that is still smaller than the cliff.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff - 10));

      let expectedRelease = 0;
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }

      // mines a new block that equal to the cliff, should start initial vesting.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff));
      
      expectedRelease = (amount / duration) * cliff / createdScheduleIDs.length;
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }


      // mines a new block to right before ending duration of vest.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration - 10));
      
      expectedRelease = (amount / duration) * (duration - 10) / createdScheduleIDs.length;
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }

      // mines a new block to right before ending duration of vest.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 10));
      
      expectedRelease = amount / createdScheduleIDs.length;
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }
    });
  });

  it("Confirm that withdrawals work", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt
      )

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      await bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )

      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      const auditor1 = await bevorProtocol.vestingSchedules(createdScheduleIDs[0]);
      const auditor2 = await bevorProtocol.vestingSchedules(createdScheduleIDs[1]);
      
      // protocol owner should've transferred all tokens to bevorProtocol
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amount);
      expect(await testToken.balanceOf(auditee)).to.equal(10);
      expect(await testToken.balanceOf(auditor1[0])).to.equal(0);

      // should return nothing as cliff wasn't reached. Auditor should still have 0 funds.
      await bevorProtocol.withdraw(createdScheduleIDs[0]);
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amount);
      expect(await testToken.balanceOf(auditor1[0])).to.equal(0);

      // mines a new block equal to the cliff, should start initial vesting.
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff));

      let expectedRelease = (amount / duration) * cliff / createdScheduleIDs.length;
      await bevorProtocol.withdraw(createdScheduleIDs[0]);

      // we might be off some some precision value by the time the _computeReleasableAmount() is called
      // allow for some delta of error.
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.be.closeTo(amount - expectedRelease, 10);
      expect(await testToken.balanceOf(auditor1[0])).to.be.closeTo(expectedRelease, 10);

      // simulate a block that occurs after the vesting period is over.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 10));

      expectedRelease = amount / createdScheduleIDs.length;
      await bevorProtocol.withdraw(createdScheduleIDs[0]);

      // we allowed some some window of error by +10 to the duration, we can be precise now.
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor1[0])).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor2[0])).to.equal(0);

      // now let's say the 2nd auditor makes a withdrawal

      await bevorProtocol.withdraw(createdScheduleIDs[1]);
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(0);
      expect(await testToken.balanceOf(auditor1[0])).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor2[0])).to.equal(expectedRelease);
  });

});