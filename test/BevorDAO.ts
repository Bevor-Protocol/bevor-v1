const { expect, assert } = require("chai");
const { ethers, BigNumber, Interface } = require("hardhat");
const { BytesLike, BigNumberish } = require("ethers");


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


  it('should return remaining unvested tokens to auditee for payment if successful DAO proposal deems it invalid', async () => {
    // Create a vesting schedule and perform necessary setup steps
    // (Assuming you have already created a vesting schedule as in your previous test)
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

    const expectedAuditeeBalance = 1000;

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

    console.log("ABI:");

    // compute vesting schedule id
    const vestingScheduleId =
      await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
        beneficiary.getAddress(),
        0
      );

    // Make a proposal to return unvested tokens to the auditee
    // This proposal should be based on the vesting address
  //  const ABI = tokenVesting.interface.format(ethers.FormatTypes.json);
 //   console.log(ABI);

//    const tif = new ethers.Interface(ABI);
    const tif = tokenVesting.interface;

    //console.log(tif);
    console.log("Encode");
    console.log(tif.encodeFunctionData("invalidateAudit", [vestingScheduleId]));
    let tvAddr = await tokenVesting.getAddress();
    

    let targets: string[];
    targets = [await tokenVesting.getAddress()];

    let values : typeof BigNumberish[];
    values = [0];

    let calldatas : typeof BytesLike[];
    calldatas = [tokenVesting.interface.encodeFunctionData("invalidateAudit", [vestingScheduleId])];

    console.log(calldatas); 

    //await tokenVesting.proposeCancelVesting(vestingScheduleId, tif.encodeFunctionData("invalidateAudit", [vestingScheduleId]));
    const tx = await bevorDAO.propose(targets, values, calldatas, "test");
    console.log("Proposal successful: " + tx);
/*
    // Vote on the proposal with BVR holders (simulate a successful vote)
    await bevorDAO.castVote(bevorDAO.proposalCount());

    // Wait for the voting period to end (ensure the proposal is successful)
    // You may need to adjust this time period based on your DAO configuration
    await ethers.provider.send('evm_increaseTime', [duration]);
    await ethers.provider.send('evm_mine');

    // Execute the successful proposal to return unvested tokens
    await bevorDAO.execute(bevorDAO.proposalCount());

    // Check that unvested tokens have been returned to the auditee's address
    const auditeeBalance = await testToken.balanceOf(addr1.address);
    expect(auditeeBalance).to.equal(expectedAuditeeBalance);
*/
    // Additional assertions as needed
  });

  it('should unfreeze vesting withdrawals for auditor if DAO proposal is unsuccessful', async () => {
    // Create a vesting schedule and perform necessary setup steps
    // (Assuming you have already created a vesting schedule as in your previous test)

    // Make a proposal to unfreeze vesting withdrawals for the auditor
    // This proposal should be based on the vesting address
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

    // Make a proposal to return unvested tokens to the auditee
    // This proposal should be based on the vesting address
    
    const ABI = tokenVesting.abi;
    const tif = new ethers.Interface(ABI);

    await tokenVesting.proposeCancelVesting(vestingScheduleId, tif.encodeFunctionData("invalidateAudit", [vestingScheduleId]));
    console.log("Proposal successful");



    // Vote on the proposal with BVR holders (simulate an unsuccessful vote)
    await bevorDAO.castVote(bevorDAO.proposalCount());

    // Wait for the voting period to end (ensure the proposal is unsuccessful)
    // You may need to adjust this time period based on your DAO configuration
    await ethers.provider.send('evm_increaseTime', [duration]);
    await ethers.provider.send('evm_mine');

    // Check that vesting withdrawals for the auditor have been unfrozen ***Fix this syntax with a chatGPT comparison to other file***
    const isFrozen = await tokenVesting.vestingWithdrawalsFrozen();
    expect(isFrozen).to.equal(false);

    // Additional assertions as needed
  });

});
