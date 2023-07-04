import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("TokenVesting", function () {
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

  describe("Vesting", function () {
    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await testToken.balanceOf(owner.getAddress());
      expect(await testToken.totalSupply()).to.equal(ownerBalance);
    });

    it("Should vest tokens gradually", async function () {
      // deploy vesting contract
      const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
      await tokenVesting.waitForDeployment();
      
      // send tokens to vesting contract
      //await testToken.transfer(tokenVesting.getAddress(), 1000);
      
      await expect(testToken.transfer(tokenVesting.getAddress(), 1000))
        .to.emit(testToken, "Transfer")
        .withArgs(owner.getAddress(), tokenVesting.getAddress(), 1000);

      const vestingContractBalance = await testToken.balanceOf(
        tokenVesting.getAddress()
      );
      expect(vestingContractBalance).to.equal(1000);

      //TODO: Figure out what this call is for
      //expect(await tokenVesting.getWithdrawableAmount()).to.equal(1000);

      const baseTime = 1622551248;
      const beneficiary = addr1;
      const startTime = baseTime;
      const cliff = 0;
      const duration = 1000;
      const slicePeriodSeconds = 1;
      const amount =  100;

      /*
      createVestingSchedule(
        address _auditor,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration,
        uint256 _slicePeriodSeconds,
        uint256 _amount,
        ERC20 _token,
        uint256 _tokenId
    )
      */

    await testToken.approve(tokenVesting.getAddress(), 1000);
    await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

      // create new vesting schedule
      await tokenVesting.createVestingSchedule(
        beneficiary.getAddress(),
        startTime,
        cliff,
        duration,
        slicePeriodSeconds,
        amount,
        testToken.getAddress(),
        testToken.getAddress()
      );

      expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
      expect(
        await tokenVesting.getVestingSchedulesCountByBeneficiary(
          beneficiary.getAddress()
        )
      ).to.be.equal(1);

      console.log(-7)

      // TODO: Change get token to grabbing the token vesting object from the schedule and checking token in there
      // expect((await tokenVesting.getToken()).toString()).to.equal(
      //   testToken.getAddress()
      // );

      // compute vesting schedule id
      const vestingScheduleId =
        await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
          beneficiary.getAddress(),
          0
        );

      // check that vested amount is 0
      expect(
        await tokenVesting.computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(0);

      console.log(-6)

      // set time to half the vesting period
      const halfTime = baseTime + duration / 2;
      await tokenVesting.setCurrentTime(halfTime);

      console.log(-5)

      // check that vested amount is half the total amount to vest
      expect(
        await tokenVesting
          .connect(beneficiary)
          .computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(50);

      console.log(-4)

      // check that only beneficiary can try to withdraw vested tokens
      // await expect(
      //   await tokenVesting.connect(addr2).withdraw(vestingScheduleId, 100)
      // ).to.be.revertedWith(
      //   "TokenVesting: only beneficiary and owner can withdraw vested tokens"
      // );

      console.log(-3)

      // check that beneficiary cannot withdraw more than the vested amount
      // await expect(
      //   tokenVesting.connect(beneficiary).withdraw(vestingScheduleId, 100)
      // ).to.be.revertedWith(
      //   "TokenVesting: cannot withdraw tokens, not enough vested tokens"
      // );

      console.log(-2)

      // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
      // await expect(
      //   tokenVesting.connect(beneficiary).withdraw(vestingScheduleId)
      // )
      //   .to.emit(testToken, "Transfer")
      //   .withArgs(tokenVesting.getAddress(), beneficiary.getAddress(), 50);

      await tokenVesting.connect(beneficiary).withdraw(vestingScheduleId);
      
      console.log(-1)

      // check that the vested amount is now 0
      expect(
        await tokenVesting
          .connect(beneficiary)
          .computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(0);

      let vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

      console.log(0)

      // check that the withdrawd amount is 10
      expect(vestingSchedule.withdrawn).to.be.equal(50);

      // set current time after the end of the vesting period
      await tokenVesting.setCurrentTime(baseTime + duration + 1);

      console.log(1)

      // check that the vested amount is 90
      expect(
        await tokenVesting
          .connect(beneficiary)
          .computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(50);

      console.log(2)

      // beneficiary withdraw vested tokens (45)
      // await expect(
      //   tokenVesting.connect(beneficiary).withdraw(vestingScheduleId, 45)
      // )
      //   .to.emit(testToken, "Transfer")
      //   .withArgs(tokenVesting.getAddress(), beneficiary.getAddress(), 45);

      //await tokenVesting.connect(beneficiary).withdraw(vestingScheduleId);

        console.log(3)

      // owner withdraw vested tokens (45)
      // await expect(tokenVesting.connect(owner).withdraw(vestingScheduleId, 45))
      //   .to.emit(testToken, "Transfer")
      //   .withArgs(tokenVesting.getAddress(), beneficiary.getAddress(), 45);
      // vestingSchedule = await tokenVesting.getVestingSchedule(
      //   vestingScheduleId
      // );

      await tokenVesting.connect(owner).withdraw(vestingScheduleId);

      console.log(4)

      // check that the number of withdrawd tokens is 100
      

      console.log(5)

      // check that the vested amount is 0
      expect(
        await tokenVesting
          .connect(beneficiary)
          .computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(0);

      console.log(6)

      vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

      expect(await vestingSchedule.withdrawn).to.be.equal(100);

      // check that anyone cannot revoke a vesting
      // await expect(
      //   tokenVesting.connect(addr2).revoke(vestingScheduleId)
      // ).to.be.revertedWith("UNAUTHORIZED");
      // await tokenVesting.revoke(vestingScheduleId);

      console.log(7)

      /*
       * TEST SUMMARY
       * deploy vesting contract
       * send tokens to vesting contract
       * create new vesting schedule (100 tokens)
       * check that vested amount is 0
       * set time to half the vesting period
       * check that vested amount is half the total amount to vest (50 tokens)
       * check that only beneficiary can try to withdraw vested tokens
       * check that beneficiary cannot withdraw more than the vested amount
       * withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
       * check that the withdrawd amount is 10
       * check that the vested amount is now 40
       * set current time after the end of the vesting period
       * check that the vested amount is 90 (100 - 10 withdrawd tokens)
       * withdraw all vested tokens (90)
       * check that the number of withdrawd tokens is 100
       * check that the vested amount is 0
       * check that anyone cannot revoke a vesting
       */
    });

    it("Should withdraw vested tokens if revoked", async function () {
      // deploy vesting contract
      const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
      await tokenVesting.waitForDeployment();

      // send tokens to vesting contract
      // await expect(testToken.transfer(tokenVesting.getAddress(), 1000))
      //   .to.emit(testToken, "Transfer")
      //   .withArgs(owner.getAddress(), tokenVesting.getAddress(), 1000);

      await testToken.transfer(tokenVesting.getAddress(), 1000);

      const baseTime = 1622551248;
      const beneficiary = addr1;
      const startTime = baseTime;
      const cliff = 0;
      const duration = 1000;
      const slicePeriodSeconds = 1;
      const revokable = true;
      const amount = 100;

      await testToken.approve(tokenVesting.getAddress(), 1000);
      await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

      // create new vesting schedule
      await tokenVesting.createVestingSchedule(
        beneficiary.getAddress(),
        startTime,
        cliff,
        duration,
        slicePeriodSeconds,
        amount,
        testToken.getAddress(),
        testToken.getAddress()
      );

      // compute vesting schedule id
      const vestingScheduleId =
        await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
          beneficiary.getAddress(),
          0
        );

        let vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

        expect((vestingSchedule.token).toString()).to.equal(
          testToken.getAddress()
        );

      // set time to half the vesting period
      const halfTime = baseTime + duration / 2;
      await tokenVesting.setCurrentTime(halfTime);

      //TODO: Rewrite this in a way that is testable or figure out how to make the emitting work

      //   await expect(tokenVesting.revoke(vestingScheduleId))
      //     .to.emit(testToken, "Transfer")
      //     .withArgs(tokenVesting.getAddress(), beneficiary.getAddress(), 50);
      // });
    });

    it("Should compute vesting schedule index", async function () {
      const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
      await tokenVesting.waitForDeployment();
      const expectedVestingScheduleId =
        "0xa279197a1d7a4b7398aa0248e95b8fcc6cdfb43220ade05d01add9c5468ea097";
      expect(
        (
          await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
            addr1.getAddress(),
            0
          )
        ).toString()
      ).to.equal(expectedVestingScheduleId);
      expect(
        (
          await tokenVesting.computeNextVestingScheduleIdForHolder(
            addr1.getAddress()
          )
        ).toString()
      ).to.equal(expectedVestingScheduleId);
    });

    it("Should check input parameters for createVestingSchedule method", async function () {
      const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
      await tokenVesting.waitForDeployment();
      await testToken.transfer(tokenVesting.getAddress(), 1000);
      const time = Date.now();
      await expect(
        tokenVesting.createVestingSchedule(
          addr1.getAddress(),
          time,
          0,
          0,
          1,
          false,
          1,
          testToken.getAddress(),
          testToken.getAddress()
        )
      ).to.be.revertedWith("TokenVesting: duration must be > 0");
      await expect(
        tokenVesting.createVestingSchedule(
          addr1.getAddress(),
          time,
          0,
          1,
          0,
          false,
          1,
          testToken.getAddress(),
          testToken.getAddress()
        )
      ).to.be.revertedWith("TokenVesting: slicePeriodSeconds must be >= 1");
      await expect(
        await tokenVesting.createVestingSchedule(
          addr1.getAddress(),
          time,
          0,
          1,
          0,
          false,
          1,
          testToken.getAddress(),
          testToken.getAddress()
        )
      ).to.be.revertedWith("TokenVesting: amount must be > 0");
    });
  });
});