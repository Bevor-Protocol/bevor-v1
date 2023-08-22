const { expect, assert } = require("chai");
const { ethers, BigNumber } = require("hardhat");


describe('Testing Bevor DAO Functionality', function() {
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

  before(async function() {
    Token = await ethers.getContractFactory("ERC20Token");
    TL = await ethers.getContractFactory("BevorTimelockController");
    DAO = await ethers.getContractFactory("BevorDAO");
    Audit = await ethers.getContractFactory("Audit");
    TokenVesting = await ethers.getContractFactory("MockAuditPayment");
  });

  beforeEach(async function() {
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

  it(' should freeze vesting withdrawls for auditor when proposal is created on DAO', async () => {
    // Proposal should call function on AuditPayments that can only be called by the DAO contract
    // Function should return unvested payments
    // Proposal should be made through proxy contract that calls function to pause 
    // deploy vesting contract
    const tokenVesting = await TokenVesting.deploy(bevorDAO.getAddress(), auditNFT.getAddress());
    await tokenVesting.waitForDeployment();

    await expect(testToken.transfer(await tokenVesting.getAddress(), 1000))
      .to.emit(testToken, "Transfer")
      .withArgs(await owner.getAddress(), await tokenVesting.getAddress(), 1000);

    const vestingContractBalance = await testToken.balanceOf(
      tokenVesting.getAddress()
    );
    expect(vestingContractBalance).to.equal(1000);

    const baseTime = 1622551248;
    const beneficiary = addr1;
    const startTime = baseTime;
    const cliff = 0;
    const duration = 1000;
    const slicePeriodSeconds = 1;
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

    expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
    expect(
      await tokenVesting.getVestingSchedulesCountByBeneficiary(
        beneficiary.getAddress()
      )
    ).to.be.equal(1);

    console.log(-7)

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

    // check that only beneficiary can try to withdraw vested tokens
    await expect(
      tokenVesting.connect(addr2).withdraw(vestingScheduleId)
    ).to.be.revertedWith(
      "TokenVesting: only beneficiary and owner can release vested tokens"
    );

    const vestingAddr = await tokenVesting.getAddress();
    const beneficiaryAddr = await beneficiary.getAddress();

    // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
    await expect(
      tokenVesting.connect(beneficiary).withdraw(vestingScheduleId)
    )
      .to.emit(testToken, "Transfer")
      .withArgs(vestingAddr, beneficiaryAddr, 50);

    // Make a proposal based on the vesting address
    await bevorDAO.propose([tokenVesting.getAddress], [1], [], "");
  });

  it(' should return remaining unvested tokens to auditee for payment if successful DAO proposal deems it invalid', async () => { // Return 990 testUSD tokens to auditee once proposal is successfully voted by BVR holders 
  });

  it(' should unfreeze vesting withdrawls for auditor if DAO proposal is unsuccessful', async () => { });
});
