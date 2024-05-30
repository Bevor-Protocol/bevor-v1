import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/bevorProtocol.js

describe("Bevor Protocol Functionality", function () {
  let Token: any;
  let DAO: any;
  let TL: any;
  let Audit: any;
  let testToken: any;
  let timelock: any;
  let daoProxy: any;
  let bevorProtocol: any;
  let auditNFT: any;
  let BevorProtocol: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addrs: any;
  const totalSupply = 1_000_000;
  const totalSupplyUnits = ethers.parseUnits(totalSupply.toString(), 18);

  before(async function () {
    Token = await ethers.getContractFactory("ERC20Token");
    TL = await ethers.getContractFactory("BevorTimelockController");
    DAO = await ethers.getContractFactory("DAOProxy");
    Audit = await ethers.getContractFactory("Audit");
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    testToken = await Token.deploy(totalSupplyUnits, "Test Token", "TT");
    await testToken.waitForDeployment();
    
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    
    daoProxy = await DAO.deploy();
    await daoProxy.waitForDeployment();

    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();

    bevorProtocol = await BevorProtocol.deploy(await daoProxy.getAddress(), await auditNFT.getAddress());
    await bevorProtocol.waitForDeployment();
  });

  describe("Setup", () => {
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
  });

  describe("AuditNFT", function () {

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
      const cliff = 1_000;
      const duration = 10_000;
      const details = "here are my details";
      const amount = 10_000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected);

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      const now = Math.round(new Date().getTime() / 1000);

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      expect((await bevorProtocol.audits(auditId))[5]).to.be.greaterThan(now);
      
      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);
      expect(await auditNFT.tokenOfOwnerByIndex(auditee, 0)).to.equal(tokenId);
    });

    it("struct audit NFT id matches expectation", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1_000;
      const duration = 10_000;
      const details = "here are my details";
      const amount = 10_000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected);

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      expect((await bevorProtocol.audits(auditId))[6]).to.equal(tokenId);
      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);
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

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected);

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);

      await expect(bevorProtocol.connect(auditee).revealFindings(
        findings,
        randomId,
      )).to.be.revertedWith("Only the auditee can mint this NFT");
    });
  });

  describe("Vesting", () => {

    it("Works when cliff = 0", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      
      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 0;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);
  
      await testToken.transfer(auditee, amountCorrected);
  
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
  
      // audit should not be marked as active.
      expect((await bevorProtocol.audits(auditId))[8]).to.equal(false);
      
      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);
  
      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )
      
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
  
      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);
  
      // mines a new block that is still smaller than the cliff.
      // await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff - 10));
  
      // Since duration was zero, this should almost immediately be available, just add 1s
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(1));
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.be.greaterThan(0);
  
      // mines a new block that equal to the cliff, should start initial vesting.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 1));
      
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.equal(amountCorrected / BigInt(2));
  
    });

    it("Test for underflow value (decimal point) in contract", async () => {
      // tests a low amount locked (and small cliff)
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      
      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const duration = 24 * 60 * 60;
      const details = "here are my details";
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      // these values would originally produce decimal points, which solidity can't handle.
      // make sure this passes. It should have a releasable amount > 0 on or after cliff.
      // cliff can even be zero here.
      const cliff = 1;
      const amount = 1000;

      // utilizing the decimals should fix, this is largely what passes the test.
      // we also internalize much of the decimals logic, as ERC20 passed to the contract
      // can be arbitrary.
      const amountCorrected = ethers.parseUnits(amount.toString(), 18);
  
      await testToken.transfer(auditee, amountCorrected);
  
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
  
      // audit should not be marked as active.
      expect((await bevorProtocol.audits(auditId))[8]).to.equal(false);
      
      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);
  
      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )
      
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
  
      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff + 1));
      const newRelease = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0]);

      expect(newRelease).to.be.greaterThan(0n);
    });

    it("Test incremental release amounts", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      
      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1_000;
      const duration = 10_000;
      const details = "here are my details";
      const amount = 100_000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);
  
      await testToken.transfer(auditee, amountCorrected);
  
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
  
      // audit should not be marked as active.
      expect((await bevorProtocol.audits(auditId))[8]).to.equal(false);
      
      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);
  
      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )
      
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
  
      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      let prevRelease = 0;
      const numIncrements = 20;
      const toIncrement = (duration - cliff) / numIncrements;
      for (let i = 0; i < numIncrements; i++) {
        // just to show that over time, releasable amount increases (without withdrawals).
        // Cannot increment past the duration, otherwise releasable amount will be static.
        await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff + toIncrement * i));
        const newRelease = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0]);
        expect(newRelease).to.be.greaterThan(prevRelease);
        prevRelease = newRelease;
      }
    });

    it("Validate that vesting behavior works as expected", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1_000;
      const duration = 10_000;
      const details = "here are my details";
      const amount = 100_000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected);

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      await bevorProtocol.connect(auditee).revealFindings(
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
      
      expectedRelease = ethers.parseUnits(
        ((amount / duration) * cliff / createdScheduleIDs.length).toString(),
        18,
      );
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }


      // mines a new block to right before ending duration of vest.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration - 10));
      
      expectedRelease = ethers.parseUnits(
        ((amount / duration) * (duration - 10) / createdScheduleIDs.length).toString(),
        18,
      );
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }

      // mines a new block to right before ending duration of vest.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 10));
      
      expectedRelease = ethers.parseUnits((amount / createdScheduleIDs.length).toString(), 18);
      for (let i = 0; i < createdScheduleIDs.length; i++){
        const releasable = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[i]);
        expect(releasable).to.equal(expectedRelease);
      }
    });

    it("Confirm that withdrawals work", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      
      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1_000;
      const duration = 10_000;
      const details = "here are my details";
      const amount = 100_000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected + BigInt(10));

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
      

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      const vestingSchedule1 = await bevorProtocol.vestingSchedules(createdScheduleIDs[0]);
      const vestingSchedule2 = await bevorProtocol.vestingSchedules(createdScheduleIDs[1]);
      const auditor1 = vestingSchedule1[0];
      const auditor2 = vestingSchedule2[0];
      
      // protocol owner should've transferred all tokens to bevorProtocol
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amountCorrected);
      expect(await testToken.balanceOf(auditee)).to.equal(10);
      expect(await testToken.balanceOf(auditor1)).to.equal(0);

      // should return nothing as cliff wasn't reached. Auditor should still have 0 funds.
      await bevorProtocol.withdraw(createdScheduleIDs[0]);
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amountCorrected);
      expect(await testToken.balanceOf(auditor1)).to.equal(0);

      // mines a new block equal to the cliff, should start initial vesting.
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff));

      let expectedRelease = ethers.parseUnits(
        ((amount / duration) * cliff / createdScheduleIDs.length).toString(),
        18,
      );
      await bevorProtocol.withdraw(createdScheduleIDs[0]);

      // we might be off some some precision value by the time the _computeReleasableAmount() is called
      // allow for some delta of error.
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.be.closeTo(amountCorrected - expectedRelease, BigInt(10 * 10 ** 18));
      expect(await testToken.balanceOf(auditor1)).to.be.closeTo(expectedRelease, BigInt(10 * 10 ** 18));

      // simulate a block that occurs after the vesting period is over.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 10));

      expectedRelease = ethers.parseUnits((amount / createdScheduleIDs.length).toString(), 18);
      await bevorProtocol.withdraw(createdScheduleIDs[0]);

      // we allowed some some window of error by +10 to the duration, we can be precise now.
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor1)).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor2)).to.equal(0);

      // now let's say the 2nd auditor makes a withdrawal

      await bevorProtocol.withdraw(createdScheduleIDs[1]);
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(0);
      expect(await testToken.balanceOf(auditor1)).to.equal(expectedRelease);
      expect(await testToken.balanceOf(auditor2)).to.equal(expectedRelease);
    });

    it("Test incremental withdrawal amounts", async () => {
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

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);
  
      await testToken.transfer(auditee, amountCorrected);
  
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
  
      // audit should not be marked as active.
      expect((await bevorProtocol.audits(auditId))[8]).to.equal(false);
      
      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);
  
      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )
      
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
  
      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);
      const numIncrements = 10;
      const toIncrement = Math.round((duration + 10) / numIncrements); // allow for some time after duration ends.
      for (let i = 0; i < numIncrements + 1; i++) {
        // test that withdrawals work incrementally, and as expected both before cliff, after
        // cliff, and after duration.
        // can't add zero because in first loop it'll equal previous block's timestamp ( +1 ).
        await helpers.time.increaseTo(createdAuditStartTime + BigInt(toIncrement * i + 1));

        // can call this as auditor or owner of contract (don't need to .connect())
        await bevorProtocol.withdraw(createdScheduleIDs[0]);
        await bevorProtocol.withdraw(createdScheduleIDs[1]);

        const schedule0 = await bevorProtocol.vestingSchedules(createdScheduleIDs[0]);
        const schedule1 = await bevorProtocol.vestingSchedules(createdScheduleIDs[1]);

        if (toIncrement * i + 1 < cliff) {
          expect(schedule0[2]).to.equal(0n);
          expect(schedule1[2]).to.equal(0n);
        } else {
          if (toIncrement * i + 1 < duration) {
            // ideally amount - withdrawn = releasable, but there's some precision errors,
            // due to block timestamp (we could fix the block time, but this gets the point across).
            expect(schedule0[2]).to.be.greaterThan(0);
            expect(schedule1[2]).to.be.greaterThan(0);
          } else {
            // should equal the total amount possible.
            expect(schedule0[2]).to.equal(schedule0[1]);
            expect(schedule1[2]).to.equal(schedule1[1])
          }
        }
      }

      const releasable0 = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0]);
      const releasable1 = await bevorProtocol.computeReleasableAmount(createdScheduleIDs[1]);

      expect(releasable0).to.equal(0n);
      expect(releasable1).to.equal(0n);

    });
  });

  describe("DAO", () => {

    it("Able to propose and cancel an invalidation of an audit, withdrawals pause", async () => {
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

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected + BigInt(10));

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      const vestingSchedule1 = await bevorProtocol.vestingSchedules(createdScheduleIDs[0]);
      const vestingSchedule2 = await bevorProtocol.vestingSchedules(createdScheduleIDs[1]);
      const auditor1 = vestingSchedule1[0];
      const auditor2 = vestingSchedule2[0];
      
      // protocol owner should've transferred all tokens to bevorProtocol
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amountCorrected);
      expect(await testToken.balanceOf(auditee)).to.equal(10);
      expect(await testToken.balanceOf(auditor1)).to.equal(0);

      // should return nothing as cliff wasn't reached. Auditor should still have 0 funds.
      await bevorProtocol.withdraw(createdScheduleIDs[0]);
      expect(await testToken.balanceOf(bevorProtocolAddress)).to.equal(amountCorrected);
      expect(await testToken.balanceOf(auditor1)).to.equal(0);

      // Mine an Empty Block AFTER the cliff. Confirm that there is some withdrawable amount
      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(cliff + 100));
      // check the releasable amount. should be greater than zero. Don't withdraw.
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.be.greaterThan(0); 

      expect((await bevorProtocol.audits(auditId))[7]).to.equal(0);
      expect(await bevorProtocol.isWithdrawPaused(auditId)).to.equal(false);
      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);

      // propose an invalidation
      await bevorProtocol.connect(auditee).proposeInvalidation(auditId, "");

      const proposalId = (await bevorProtocol.audits(auditId))[7];

      expect(proposalId).to.not.equal(0);
      expect(await bevorProtocol.isWithdrawPaused(auditId)).to.equal(true);
      expect(await daoProxy.isVestingInvalidated(proposalId)).to.equal(false);

      // releasable amount should equal zero since withdrawal is frozen.
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.equal(0); 

      // cancel the proposal (as deployer of contract)
      await bevorProtocol.cancelProposal(auditId);

      expect((await bevorProtocol.audits(auditId))[7]).to.not.equal(0);
      expect(await bevorProtocol.isWithdrawPaused(auditId)).to.equal(false);
      // now there should be a releasable amount again, since proposal is not frozen.
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.be.greaterThan(0);
      
      // trying to re-propose an invalidation for the same audit should revert.
      await expect(bevorProtocol.connect(auditee).proposeInvalidation(auditId, ""))
      .to.be.revertedWith("Cannot set the cancellation proposal more than once");
    });

    it("Able to completely invalidate an audit", async () => {
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

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected + BigInt(10));

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

      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

      const vestingSchedule1 = await bevorProtocol.vestingSchedules(createdScheduleIDs[0]);
      const vestingSchedule2 = await bevorProtocol.vestingSchedules(createdScheduleIDs[1]);
      const auditor1 = vestingSchedule1[0];
      const auditor2 = vestingSchedule2[0];

      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);
      expect(await testToken.balanceOf(auditee)).to.equal(BigInt(10));
      // propose an invalidation
      await bevorProtocol.connect(auditee).proposeInvalidation(auditId, "");

      const proposalId = (await bevorProtocol.audits(auditId))[7];

      // confirm burn mechanism works.
      await expect(auditNFT.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID");
      // confirm no releasable amount.
      expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.equal(0); 
      // confirm transfer of tokens back to auditee.
      expect(await testToken.balanceOf(auditee)).to.equal(amountCorrected + BigInt(10))
    });
    
    it("Public view for getting vesting schedule should work", async () => {
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

      const vestingScheduleId0 = await bevorProtocol.getVestingScheduleIdByAddressAndAudit(
        addrs[0],
        auditId,
      );

      expect((await bevorProtocol.vestingSchedules(vestingScheduleId0))[0]).to.equal(addrs[0]);

      const vestingScheduleId1 = await bevorProtocol.getVestingScheduleIdByAddressAndAudit(
        addrs[1],
        auditId,
      );

      expect((await bevorProtocol.vestingSchedules(vestingScheduleId1))[0]).to.equal(addrs[1]);

      await expect(bevorProtocol.getVestingScheduleIdByAddressAndAudit(
        addrs[2],
        auditId,
      )).to.be.revertedWith("No vesting schedule found for this auditor in this audit");
    })
  });
});
