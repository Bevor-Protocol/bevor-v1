import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("ManualDAO Functionality", function () {
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
    DAOProxy = await ethers.getContractFactory("ManualDAO");
    Audit = await ethers.getContractFactory("Audit");
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    testToken = await Token.deploy(totalSupplyUnits, "Test Token", "TT");
    await testToken.waitForDeployment();
    daoProxy = await DAOProxy.deploy();
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
    const allowance = await testToken.allowance(auditee, bevorProtocolAddress);
    console.log("Allowance: ", allowance.toString());

    await bevorProtocol.connect(auditee).revealFindings(
      findings,
      auditId,
    )
    
    const createdAuditStartTime = (await bevorProtocol.audits(auditId))[5];

    const createdScheduleIDs = await bevorProtocol.getVestingSchedulesForAudit(auditId);

    await helpers.time.increaseTo(createdAuditStartTime + BigInt(1));

    // mines a new block that equal to the cliff, should start initial vesting.
    await helpers.time.increaseTo(createdAuditStartTime + BigInt(duration + 1));
    expect(await bevorProtocol.computeReleasableAmount(createdScheduleIDs[0])).to.be.greaterThan(0);
    await daoProxy.connect(auditee).propose([], [auditId], [], `Audit Proposal ${1}: ${auditId}`);
  });

  describe("Create proposal and freeze", function () {
    it("should allow creating a proposal and freezing it", async function () {
      // await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalFrozen(proposalId, true);
      console.log("PROPS: " + await daoProxy.proposals());
      let frozen = await daoProxy.isWithdrawFrozen(proposalId);
      
      expect(frozen).to.equal(true);
    });
  });

  describe("Create proposal and invalidate", function () {
    it("should allow creating a proposal and invalidating it", async function () {
      // await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalInvalidated(proposalId, true);
      expect(await daoProxy.isVestingInvalidated(proposalId)).to.equal(true);
    });
  });

  describe("Create freeze and invalidate", function () {
    it("should allow freezing and invalidating a proposal", async function () {
      // await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalFrozen(proposalId, true);
      await daoProxy.setProposalInvalidated(proposalId, true);
      expect(await daoProxy.isWithdrawFrozen(proposalId)).to.equal(true);
      expect(await daoProxy.isVestingInvalidated(proposalId)).to.equal(true);
    });
  });

});
