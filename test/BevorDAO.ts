import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("BevorDAO Functionality", function () {
  let manualDAO: any;
  let daoProxy: any;
  let ManualDAO: any;
  let DAOProxy: any;
  let BevorProtocol: any;
  let Audit: any;
  let auditNFT: any;
  let bevorProtocol: any;
  let Token: any;
  let testToken: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addrs: any;
  const totalSupply = 1_000_000;
  const totalSupplyUnits = ethers.parseUnits(totalSupply.toString(), 18);

  before(async function () {
    Token = await ethers.getContractFactory("BevorToken");
    DAOProxy = await ethers.getContractFactory("BevorDAOMock");
    Audit = await ethers.getContractFactory("Audit");
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    testToken = await Token.deploy(totalSupplyUnits, "Test Token", "TT");
    await testToken.waitForDeployment();

    // Deploy TimelockController
    const minDelay = 3600; // 1 hour
    const proposers = [owner.getAddress()];
    const executors = [owner.getAddress()];
    const timelock = await ethers.getContractFactory("TimelockController");
    const timelockController = await timelock.deploy(minDelay, proposers, executors, owner);
    await timelockController.waitForDeployment();

    daoProxy = await DAOProxy.deploy(testToken.getAddress(), timelockController.getAddress());
    await daoProxy.waitForDeployment();
    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();

    bevorProtocol = await BevorProtocol.deploy(await daoProxy.getAddress(), await auditNFT.getAddress());
    await bevorProtocol.waitForDeployment();

    daoProxy.setBevorProtocol(await bevorProtocol.getAddress());
    const auditee = addr1;
    const auditors = [addrs[0], addrs[1]];
    const cliff = 1000;
    const duration = 10000;
    const details = "here are my details";
    const amount = 100000;
    const salt = "123";
    const tokenAddress = await testToken.getAddress();
    const bevorProtocolAddress = await bevorProtocol.getAddress();
    const findings = ["finding 1", "finding 2"];

    // Create 5 audits in bevor protocol and pass them in one by one into propose
    for (let i = 0; i < 5; i++) {
      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt + i
      );

      const amountCorrected = ethers.parseUnits(amount.toString(), 18);

      await testToken.transfer(auditee, amountCorrected + BigInt(10));

      await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt + i,
      );


      await testToken.connect(auditee).approve(bevorProtocolAddress, amountCorrected);
      const allowance = await testToken.allowance(auditee, bevorProtocolAddress);

      await bevorProtocol.connect(auditee).revealFindings(
        findings,
        auditId,
      )

      const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];

  
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(1));
  
      // mines a new block that equal to the cliff, should start initial vesting.
      await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 1));
    }

  });

  describe("Proposal state checks", function () {
    it("should check the state and conditions of proposals", async function () {
      for (let i = 1; i <= 5; i++) {
        let state = await daoProxy.state(i);
        let isFrozen = await daoProxy.isWithdrawFrozen(i);
        let isInvalidated = await daoProxy.isVestingInvalidated(i);

        if (i === 1) {
          expect(state).to.equal(0); // Pending
          expect(isFrozen).to.equal(true);
          expect(isInvalidated).to.equal(false);
        } else if (i === 2) {
          expect(state).to.equal(1); // Active
          expect(isFrozen).to.equal(true);
          expect(isInvalidated).to.equal(false);
        } else if (i === 3) {
          expect(state).to.equal(2); // Canceled
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(false);
        } else if (i === 4) {
          expect(state).to.equal(7); // Executed
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(true);
        } else if (i === 5) {
          expect(state).to.equal(4); // Succeeded
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(true);
        }
      }
    });
  });

});
