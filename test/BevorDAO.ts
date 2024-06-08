import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

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
    DAOProxy = await ethers.getContractFactory("ManualDAO");
    Audit = await ethers.getContractFactory("Audit");
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    // testToken = await Token.deploy(totalSupplyUnits, "Test Token", "TT");
    // await testToken.waitForDeployment();
    daoProxy = await DAOProxy.deploy();
    await daoProxy.waitForDeployment();
    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();

    bevorProtocol = await BevorProtocol.deploy(await daoProxy.getAddress(), await auditNFT.getAddress());
    await bevorProtocol.waitForDeployment();

    daoProxy.setBevorProtocol(await bevorProtocol.getAddress());
    // Create 5 audits in bevor protocol and pass them in one by one into propose
    for (let i = 0; i < 5; i++) {
      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "Test_" + i;

      const auditId = await bevorProtocol.generateAuditId(
        auditee,
        auditors,
        cliff,
        duration,
        details,
        amount,
        "0x",
        salt
      )
      await daoProxy.propose([], [auditId], [], `Audit Proposal ${i + 1}: ${auditId}`);
    }

  });

  describe("Proposal state checks", function () {
    it("should check the state and conditions of proposals", async function () {
      for (let i = 1; i <= 5; i++) {
        let state = await daoProxy.state(i);
        let isFrozen = await daoProxy.isWithdrawFrozen(i);
        let isInvalidated = await daoProxy.isVestingInvalidated(i);

        if (i === 1) {
          expect(state).to.equal("Pending");
          expect(isFrozen).to.equal(true);
          expect(isInvalidated).to.equal(false);
        } else if (i === 2) {
          expect(state).to.equal("Active");
          expect(isFrozen).to.equal(true);
          expect(isInvalidated).to.equal(false);
        } else if (i === 3) {
          expect(state).to.equal("Canceled");
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(false);
        } else if (i === 4) {
          expect(state).to.equal("Executed");
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(true);
        } else if (i === 5) {
          expect(state).to.equal("Succeeded");
          expect(isFrozen).to.equal(false);
          expect(isInvalidated).to.equal(true);
        }
      }
    });
  });

});
