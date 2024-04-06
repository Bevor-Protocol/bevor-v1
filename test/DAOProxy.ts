import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("DAOProxy Functionality", function () {
  let manualDAO: any;
  let daoProxy: any;
  let ManualDAO: any;
  let DAOProxy: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addrs: any;

  before(async function () {
    DAOProxy = await ethers.getContractFactory("DAOProxy");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    daoProxy = await DAOProxy.deploy();
    await daoProxy.waitForDeployment();
  });

  describe("Create proposal and freezez", function () {
    it("should allow creating a proposal and freezing it", async function () {
      await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalFrozen(proposalId, true);
      console.log("PROPS: " + await daoProxy.proposals());
      let frozen = await daoProxy.isWithdrawFrozen(proposalId);
      
      expect(frozen).to.equal(true);
    });
  });

  describe("Create proposal and invalidate", function () {
    it("should allow creating a proposal and invalidating it", async function () {
      await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalInvalidated(proposalId, true);
      expect(await daoProxy.isVestingInvalidated(proposalId)).to.equal(true);
    });
  });

  describe("Create freeze and invalidate", function () {
    it("should allow freezing and invalidating a proposal", async function () {
      await daoProxy.propose([], [], [], "");
      let proposalId = await daoProxy.proposals();
      await daoProxy.setProposalFrozen(proposalId, true);
      await daoProxy.setProposalInvalidated(proposalId, true);
      expect(await daoProxy.isWithdrawFrozen(proposalId)).to.equal(true);
      expect(await daoProxy.isVestingInvalidated(proposalId)).to.equal(true);
    });
  });

});
