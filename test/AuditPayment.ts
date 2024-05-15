import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("TokenVesting", function () {
  let Token: any;
  let DAOProxy: any;
  let TL: any;
  let Audit: any;
  let testToken: any;
  let timelock: any;
  let daoProxy: any;
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
    DAOProxy = await ethers.getContractFactory("DAOProxy");
    Audit = await ethers.getContractFactory("Audit");
    TokenVesting = await ethers.getContractFactory("MockAuditPayment");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    testToken = await Token.deploy(totalSupply, "Test Token", "TT");
    await testToken.waitForDeployment();
    
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    
    daoProxy = await DAOProxy.deploy();
    await daoProxy.waitForDeployment();
  });

  describe("Vesting", function () {
    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await testToken.balanceOf(owner.getAddress());
      expect(await testToken.totalSupply()).to.equal(ownerBalance);
    });

    it("Should vest tokens gradually", async function () {
  
      const tokenVesting = await TokenVesting.deploy(await daoProxy.getAddress());
      await tokenVesting.waitForDeployment();

      const tokenVestingAddress = await tokenVesting.getAddress()

      // auditNFT contract required later
      auditNFT = await Audit.deploy(tokenVestingAddress);
      await auditNFT.waitForDeployment();
      
      expect(await testToken.transfer(tokenVestingAddress, 1000))
        .to.emit(testToken, "Transfer")
        .withArgs(await owner.getAddress(), tokenVestingAddress, 1000);

      const vestingContractBalance = await testToken.balanceOf(tokenVestingAddress);
      expect(vestingContractBalance).to.equal(1000);

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];

      const cliff = 10;
      const duration = 1000;
      const slicePeriodSeconds = 1;
      const amount =  100;
      const salt = 5000;
      const details = "some random content";
      const baseTime = 1622551248;

      const testTokenAddress = await testToken.getAddress();


      await testToken.approve(tokenVestingAddress, 1000);
      await auditNFT.connect(addr1).setApprovalForAll(tokenVestingAddress, true);

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
      
      // under the hood calls createVestingSchedule() for each auditor.
      await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);


      expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(2);
      expect(
        await tokenVesting.getVestingSchedulesCountByBeneficiary(
          auditors[0]
        )
      ).to.be.equal(1);
      expect(
        await tokenVesting.getVestingSchedulesCountByBeneficiary(
          auditors[1]
        )
      ).to.be.equal(1);

      console.log(-7)

      // compute vesting schedule id
      const vestingScheduleId =
        await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
          auditors[0],
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
        await tokenVesting.computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(50);

      await daoProxy.propose([], [], [], "");

      // check that only beneficiary can try to withdraw vested tokens
      await expect(
        tokenVesting.connect(addr2).withdraw(vestingScheduleId)
      ).to.be.revertedWith(
        "TokenVesting: only beneficiary and owner can release vested tokens"
      );

      // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
      await expect(
        tokenVesting.connect(auditors[0]).withdraw(vestingScheduleId)
      )
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVestingAddress, auditors[0], 50);

      // check that the vested amount is now 0
      expect(
        await tokenVesting
          .connect(auditors[0])
          .computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(0);

      let vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

      // check that the withdrawd amount is 10
      expect(vestingSchedule.withdrawn).to.be.equal(50);

      // set current time after the end of the vesting period
      await tokenVesting.setCurrentTime(baseTime + duration + 1);

      console.log(1)

      // check that the vested amount is 90
      expect(
        await tokenVesting.computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(50);

      console.log(2)

      // beneficiary withdraw vested tokens (50)
      await expect(
        tokenVesting.connect(auditors[0]).withdraw(vestingScheduleId)
      )
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVestingAddress, auditors[0], 50);

      //await tokenVesting.connect(beneficiary).withdraw(vestingScheduleId);

        console.log(3)

      // owner withdraw vested tokens (50)
      await expect(tokenVesting.connect(owner).withdraw(vestingScheduleId))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVestingAddress, auditors[0], 0);
      vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

      await tokenVesting.connect(owner).withdraw(vestingScheduleId);

      console.log(4)

      // check that the number of withdrawd tokens is 100
      

      console.log(5)

      // check that the vested amount is 0
      expect(
        await tokenVesting.computeReleasableAmount(vestingScheduleId)
      ).to.be.equal(0);

      console.log(6)

      vestingSchedule = await tokenVesting.getVestingSchedule(
        vestingScheduleId
      );

      expect(await vestingSchedule.withdrawn).to.be.equal(100);

      // check that anyone cannot revoke a vesting (CALL THIS IN BEVORDAO.TS)
      /*await expect(
        tokenVesting.connect(addr2).invalidateAudit(vestingScheduleId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await tokenVesting.invalidateAudit(vestingScheduleId);
      */
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

//     it("Should withdraw vested tokens if revoked", async function () {
//       // deploy vesting contract
//       const tokenVesting = await TokenVesting.deploy(auditNFT.getAddress(), daoProxy.getAddress());
//       await tokenVesting.waitForDeployment();
      
//       const tokenAddr = await tokenVesting.getAddress();
//       const ownerAddr = await owner.getAddress();

//       // send tokens to vesting contract
//       await expect(testToken.transfer(tokenAddr, 1000))
//         .to.emit(testToken, "Transfer")
//         .withArgs(ownerAddr, tokenAddr, 1000);

//       const baseTime = 1622551248;
//       const beneficiary = addr1;
//       const beneficiaryAddr = await beneficiary.getAddress();
//       const startTime = baseTime;
//       const cliff = 0;
//       const duration = 1000;
//       const slicePeriodSeconds = 1;
//       const revokable = true;
//       const amount = 100;

//       await testToken.approve(tokenVesting.getAddress(), 1000);
//       await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//       let tokenId = await auditNFT.generateProof("b", 321);

//       console.log("OWNER: " + await auditNFT.ownerOf(tokenId));

//       // create new vesting schedule
//       await tokenVesting.createVestingSchedule(
//         [beneficiary.getAddress()],
//         startTime,
//         cliff,
//         duration,
//         slicePeriodSeconds,
//         amount,
//         testToken.getAddress(),
//         tokenId
//       );

//       // compute vesting schedule id
//       const vestingScheduleId =
//         await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//           beneficiary.getAddress(),
//           0
//         );

//         let vestingSchedule = await tokenVesting.getVestingSchedule(
//         vestingScheduleId
//       );

//       const tokeAddr = await testToken.getAddress();

//       console.log("Token ADDR: " + tokeAddr);

//         expect((vestingSchedule.token).toString()).to.equal(
//           tokeAddr 
//         );

//       // set time to half the vesting period
//       const halfTime = baseTime + duration / 2;
//       await tokenVesting.setCurrentTime(halfTime);
//       });
//     });

//     it("Should compute vesting schedule index", async function () {
//       const tokenVesting = await TokenVesting.deploy(daoProxy.getAddress(), auditNFT.getAddress());
//       await tokenVesting.waitForDeployment();
//       // Check this for validity before pushing to mainnet, find repo reference for this test
//       const expectedVestingScheduleId =
//         "0x501b07787e94012e530aadb55dfa2e302b52d163ceb8a7f9065ec16692f75bfe";
//       expect(
//         (
//           await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//             addr1.getAddress(),
//             0
//           )
//         ).toString()
//       ).to.equal(expectedVestingScheduleId);

//       expect(
//         (
//           await tokenVesting.computeNextVestingScheduleIdForHolder(
//             addr1.getAddress()
//           )
//         ).toString()
//       ).to.equal(expectedVestingScheduleId);
//     });

//     it("Should check input parameters for createVestingSchedule method", async function () {
//       const tokenVesting = await TokenVesting.deploy(daoProxy.getAddress(), auditNFT.getAddress());
//       await tokenVesting.waitForDeployment();
//       await testToken.transfer(tokenVesting.getAddress(), 1000);
//       const time = Date.now();
//       await testToken.approve(tokenVesting.getAddress(), 1000);
//       await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//       let tokenId = await auditNFT.generateProof("b", 321);

//       // Nondescript error not happening up to this point
//       await expect(
//         tokenVesting.createVestingSchedule(
//           [addr1.getAddress()],
//           time,
//           0,
//           0,
//           1,
//           1,
//           testToken.getAddress(),
//           tokenId
//         )
//       ).to.be.revertedWith("TokenVesting: duration must be > 0");
//       await expect(
//         tokenVesting.createVestingSchedule(
//           [addr1.getAddress()],
//           time,
//           0,
//           1,
//           0,
//           1,
//           testToken.getAddress(),
//           tokenId
//         )
//       ).to.be.revertedWith("TokenVesting: slicePeriodSeconds must be >= 1");
      
//       await expect(
//         tokenVesting.createVestingSchedule(
//           [addr1.getAddress()],
//           time,
//           0,
//           1,
//           1,
//           0,
//           testToken.getAddress(),
//           tokenId
//         )
//       ).to.be.revertedWith("TokenVesting: amount must be > 0");
//     });



//       it('Should freeze vesting withdrawls for auditor when proposal is created on DAO', async () => {
//     // Proposal should call function on AuditPayments that can only be called by the DAO contract
//     // Function should return unvested payments
//     // Proposal should be made through proxy contract that calls function to pause 
//     // deploy vesting contract
//     const tokenVesting = await TokenVesting.deploy(auditNFT.getAddress(), daoProxy.getAddress());
//     await tokenVesting.waitForDeployment();

//     await expect(testToken.transfer(await tokenVesting.getAddress(), 1000))
//       .to.emit(testToken, "Transfer")
//       .withArgs(await owner.getAddress(), await tokenVesting.getAddress(), 1000);

//     const vestingContractBalance = await testToken.balanceOf(
//       tokenVesting.getAddress()
//     );
//     expect(vestingContractBalance).to.equal(1000);

//     const baseTime = 1622551248;
//     const beneficiary = addr1;
//     const startTime = baseTime;
//     const cliff = 0;
//     const duration = 1000;
//     const slicePeriodSeconds = 1;
//     const amount = 100;


//     await testToken.approve(tokenVesting.getAddress(), 1000);
//     await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//     let tokenId = await auditNFT.generateProof("b", 321);

//     // create new vesting schedule
//     await tokenVesting.createVestingSchedule(
//       [beneficiary.getAddress()],
//       startTime,
//       cliff,
//       duration,
//       slicePeriodSeconds,
//       amount,
//       testToken.getAddress(),
//       tokenId
//     );

//     expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
//     expect(
//       await tokenVesting.getVestingSchedulesCountByBeneficiary(
//         beneficiary.getAddress()
//       )
//     ).to.be.equal(1);

//     console.log(-7)

//     // compute vesting schedule id
//     const vestingScheduleId =
//       await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//         beneficiary.getAddress(),
//         0
//       );

//     // check that vested amount is 0
//     expect(
//       await tokenVesting.computeReleasableAmount(vestingScheduleId)
//     ).to.be.equal(0);

//     console.log(-6)

//     // set time to half the vesting period
//     const halfTime = baseTime + duration / 2;
//     await tokenVesting.setCurrentTime(halfTime);

//     console.log(-5)

//     // check that vested amount is half the total amount to vest
//     expect(
//       await tokenVesting
//         .connect(beneficiary)
//         .computeReleasableAmount(vestingScheduleId)
//     ).to.be.equal(50);

//     // check that only beneficiary can try to withdraw vested tokens
//     await expect(
//       tokenVesting.connect(addr2).withdraw(vestingScheduleId)
//     ).to.be.revertedWith(
//       "TokenVesting: only beneficiary and owner can release vested tokens"
//     );

//     const vestingAddr = await tokenVesting.getAddress();
//     const beneficiaryAddr = await beneficiary.getAddress();

//     // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
//     await expect(
//       tokenVesting.connect(beneficiary).withdraw(vestingScheduleId)
//     )
//       .to.emit(testToken, "Transfer")
//       .withArgs(vestingAddr, beneficiaryAddr, 50);

//     // Make a proposal based on the vesting address
//     await daoProxy.propose([await tokenVesting.getAddress()], [1], [], "");
//     await tokenVesting.setInvalidatingProposalId(vestingScheduleId, 1);
//     console.log("Invalidating Proposal ID went through");
//     await expect(await tokenVesting.isWithdrawlPaused(vestingScheduleId)).to.be.equal(true);

//   });

//   it(' should unfreeze vesting withdrawls for auditor when proposal is created on DAO with canceled proposal state', async () => {
//     // Proposal should call function on AuditPayments that can only be called by the DAO contract
//     // Function should return unvested payments
//     // Proposal should be made through proxy contract that calls function to pause 
//     // deploy vesting contract
//     const tokenVesting = await TokenVesting.deploy(auditNFT.getAddress(), daoProxy.getAddress());
//     await tokenVesting.waitForDeployment();

//     await expect(testToken.transfer(await tokenVesting.getAddress(), 1000))
//       .to.emit(testToken, "Transfer")
//       .withArgs(await owner.getAddress(), await tokenVesting.getAddress(), 1000);

//     const vestingContractBalance = await testToken.balanceOf(
//       tokenVesting.getAddress()
//     );
//     expect(vestingContractBalance).to.equal(1000);

//     const baseTime = 1622551248;
//     const beneficiary = addr1;
//     const startTime = baseTime;
//     const cliff = 0;
//     const duration = 1000;
//     const slicePeriodSeconds = 1;
//     const amount = 100;


//     await testToken.approve(tokenVesting.getAddress(), 1000);
//     await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//     let tokenId = await auditNFT.generateProof("b", 321);

//     // create new vesting schedule
//     await tokenVesting.createVestingSchedule(
//       [beneficiary.getAddress()],
//       startTime,
//       cliff,
//       duration,
//       slicePeriodSeconds,
//       amount,
//       testToken.getAddress(),
//       tokenId
//     );

//     expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
//     expect(
//       await tokenVesting.getVestingSchedulesCountByBeneficiary(
//         beneficiary.getAddress()
//       )
//     ).to.be.equal(1);

//     console.log(-7)

//     // compute vesting schedule id
//     const vestingScheduleId =
//       await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//         beneficiary.getAddress(),
//         0
//       );

//     // check that vested amount is 0
//     expect(
//       await tokenVesting.computeReleasableAmount(vestingScheduleId)
//     ).to.be.equal(0);

//     console.log(-6)

//     // set time to half the vesting period
//     const halfTime = baseTime + duration / 2;
//     await tokenVesting.setCurrentTime(halfTime);

//     console.log(-5)

//     // check that vested amount is half the total amount to vest
//     expect(
//       await tokenVesting
//         .connect(beneficiary)
//         .computeReleasableAmount(vestingScheduleId)
//     ).to.be.equal(50);

//     // check that only beneficiary can try to withdraw vested tokens
//     await expect(
//       tokenVesting.connect(addr2).withdraw(vestingScheduleId)
//     ).to.be.revertedWith(
//       "TokenVesting: only beneficiary and owner can release vested tokens"
//     );

//     const vestingAddr = await tokenVesting.getAddress();
//     const beneficiaryAddr = await beneficiary.getAddress();

//     // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
//     await expect(
//       tokenVesting.connect(beneficiary).withdraw(vestingScheduleId)
//     )
//       .to.emit(testToken, "Transfer")
//       .withArgs(vestingAddr, beneficiaryAddr, 50);

//     // Make a proposal based on the vesting address
//     await daoProxy.propose([], [], [], "");
//     await tokenVesting.setInvalidatingProposalId(vestingScheduleId, 1);
//     await expect(await tokenVesting.isWithdrawlPaused(vestingScheduleId)).to.be.equal(true);
//     await daoProxy.setProposalFrozen(1, false);
//     await expect(await tokenVesting.isWithdrawlPaused(vestingScheduleId)).to.be.equal(false);
//   });

//   it('should return remaining unvested tokens to auditee for payment if successful DAO proposal deems it invalid', async () => {
//     // Create a vesting schedule and perform necessary setup steps
//     // (Assuming you have already created a vesting schedule as in your previous test)
//     // deploy vesting contract
//     const tokenVesting = await TokenVesting.deploy(auditNFT.getAddress(), daoProxy.getAddress());
//     await tokenVesting.waitForDeployment();

//     await expect(testToken.transfer(await tokenVesting.getAddress(), 1000))
//       .to.emit(testToken, "Transfer")
//       .withArgs(await owner.getAddress(), await tokenVesting.getAddress(), 1000);

//     const vestingContractBalance = await testToken.balanceOf(
//       tokenVesting.getAddress()
//     );
//     expect(vestingContractBalance).to.equal(1000);

//     const baseTime = 1622551248;
//     const beneficiary = addr1;
//     const startTime = baseTime;
//     const cliff = 0;
//     const duration = 1000;
//     const slicePeriodSeconds = 1;
//     const amount = 100;

//     const expectedAuditeeBalance = 1000;

//     await testToken.approve(tokenVesting.getAddress(), 1000);
//     await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//     let tokenId = await auditNFT.generateProof("b", 321);

//     // create new vesting schedule
//     await tokenVesting.createVestingSchedule(
//       [beneficiary.getAddress()],
//       startTime,
//       cliff,
//       duration,
//       slicePeriodSeconds,
//       amount,
//       testToken.getAddress(),
//       tokenId
//     );

//     expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
//     expect(
//       await tokenVesting.getVestingSchedulesCountByBeneficiary(
//         beneficiary.getAddress()
//       )
//     ).to.be.equal(1);

//     console.log("ABI:");

//     // compute vesting schedule id
//     const vestingScheduleId =
//       await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//         beneficiary.getAddress(),
//         0
//       );

//     // Make a proposal to return unvested tokens to the auditee
//     // This proposal should be based on the vesting address
//   //  const ABI = tokenVesting.interface.format(ethers.FormatTypes.json);
//  //   console.log(ABI);

// //    const tif = new ethers.Interface(ABI);
//     const tif = tokenVesting.interface;

//     //console.log(tif);
//     console.log("Encode");
//     console.log(tif.encodeFunctionData("invalidateAudit", [vestingScheduleId]));
//     let tvAddr = await tokenVesting.getAddress();
    

//     let targets: string[];
//     targets = [await tokenVesting.getAddress()];

//     let values : any;
//     values = [0];

//     let calldatas : any;
//     calldatas = [tokenVesting.interface.encodeFunctionData("invalidateAudit", [vestingScheduleId])];

//     console.log(calldatas); 

//     //await tokenVesting.proposeCancelVesting(vestingScheduleId, tif.encodeFunctionData("invalidateAudit", [vestingScheduleId]));
//     const tx = await daoProxy.propose(targets, values, calldatas, "test");
//     console.log("Proposal successful: " + tx);
// /*
//     // Vote on the proposal with BVR holders (simulate a successful vote)
//     await bevorDAO.castVote(bevorDAO.proposalCount());

//     // Wait for the voting period to end (ensure the proposal is successful)
//     // You may need to adjust this time period based on your DAO configuration
//     await ethers.provider.send('evm_increaseTime', [duration]);
//     await ethers.provider.send('evm_mine');

//     // Execute the successful proposal to return unvested tokens
//     await bevorDAO.execute(bevorDAO.proposalCount());

//     // Check that unvested tokens have been returned to the auditee's address
//     const auditeeBalance = await testToken.balanceOf(addr1.address);
//     expect(auditeeBalance).to.equal(expectedAuditeeBalance);
// */
//     // Additional assertions as needed
//   });

//   it('Create multiple vesting schedules at once, should only have different auditors.', async () => {
//       // TODO: Figure out why constructor inputs here are reversed
//       const tokenVesting = await TokenVesting.deploy(await auditNFT.getAddress(), await daoProxy.getAddress());
//       await tokenVesting.waitForDeployment();

//       console.log("DPADDR: " + await daoProxy.getAddress())
//       console.log("DPADDR: " + await auditNFT.getAddress())
//       console.log("DAOADDR: " + await tokenVesting.dao())
      
//       await expect(testToken.transfer(await tokenVesting.getAddress(), 1000))
//         .to.emit(testToken, "Transfer")
//         .withArgs(await owner.getAddress(), await tokenVesting.getAddress(), 1000);

//       const vestingContractBalance = await testToken.balanceOf(
//         tokenVesting.getAddress()
//       );
//       expect(vestingContractBalance).to.equal(1000);

//       const baseTime = 1622551248;
//       const beneficiaries = [addr1, addrs[4], addrs[5]];
//       const startTime = baseTime;
//       const cliff = 0;
//       const duration = 1000;
//       const slicePeriodSeconds = 1;
//       const amount =  300;

//       /*
//       createVestingSchedule(
//         address _auditor,
//         uint256 _start,
//         uint256 _cliff,
//         uint256 _duration,
//         uint256 _slicePeriodSeconds,
//         uint256 _amount,
//         ERC20 _token,
//         uint256 _tokenId
//     )
//       */

//     await testToken.approve(tokenVesting.getAddress(), 1000);
//     await auditNFT.connect(addr1).setApprovalForAll(tokenVesting.getAddress(), true);

//     let tokenId = await auditNFT.generateProof("b", 321);

//       // create new vesting schedule
//       await tokenVesting.createVestingSchedule(
//         [beneficiaries[0].getAddress(), beneficiaries[1].getAddress(), beneficiaries[2].getAddress()],
//         startTime,
//         cliff,
//         duration,
//         slicePeriodSeconds,
//         amount,
//         testToken.getAddress(),
//         tokenId
//       );

//       expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(3);


//       for (let i = 0; i < 3; i++) {
//         // Reset to test each pass fresh
//         await tokenVesting.setCurrentTime(baseTime);
        
//         expect(
//           await tokenVesting.getVestingSchedulesCountByBeneficiary(
//             beneficiaries[i].getAddress()
//           )
//         ).to.be.equal(1);
        

//         // compute vesting schedule id
//         const vestingScheduleId =
//           await tokenVesting.computeVestingScheduleIdForAddressAndIndex(
//             beneficiaries[i].getAddress(),
//             0
//           );

//         // check that vested amount is 0
//         expect(
//           await tokenVesting.computeReleasableAmount(vestingScheduleId)
//         ).to.be.equal(0);

//         console.log(-6)

//         // set time to half the vesting period
//         const halfTime = baseTime + duration / 2;
//         await tokenVesting.setCurrentTime(halfTime);

//         console.log(-5)

//         // check that vested amount is half the total amount to vest
//         expect(
//           await tokenVesting
//             .connect(beneficiaries[i])
//             .computeReleasableAmount(vestingScheduleId)
//         ).to.be.equal(50);

//         await daoProxy.propose([], [], [], "");

//         // check that only beneficiary can try to withdraw vested tokens
//         await expect(
//           tokenVesting.connect(addr2).withdraw(vestingScheduleId)
//         ).to.be.revertedWith(
//           "TokenVesting: only beneficiary and owner can release vested tokens"
//         );

//         const vestingAddr = await tokenVesting.getAddress();
//         const beneficiaryAddr = await beneficiaries[i].getAddress();

//         // withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
//         await expect(
//           tokenVesting.connect(beneficiaries[i]).withdraw(vestingScheduleId)
//         )
//           .to.emit(testToken, "Transfer")
//           .withArgs(vestingAddr, beneficiaryAddr, 50);

//         // check that the vested amount is now 0
//         expect(
//           await tokenVesting
//             .connect(beneficiaries[i])
//             .computeReleasableAmount(vestingScheduleId)
//         ).to.be.equal(0);

//         let vestingSchedule = await tokenVesting.getVestingSchedule(
//           vestingScheduleId
//         );

//         // check that the withdrawd amount is 10
//         expect(vestingSchedule.withdrawn).to.be.equal(50);

//         // set current time after the end of the vesting period
//         await tokenVesting.setCurrentTime(baseTime + duration + 1);

//         console.log(1)

//         // check that the vested amount is 90
//         expect(
//           await tokenVesting
//             .connect(beneficiaries[i])
//             .computeReleasableAmount(vestingScheduleId)
//         ).to.be.equal(50);

//         console.log(2)

//         // beneficiary withdraw vested tokens (50)
//         await expect(
//           tokenVesting.connect(beneficiaries[i]).withdraw(vestingScheduleId)
//         )
//           .to.emit(testToken, "Transfer")
//           .withArgs(vestingAddr, beneficiaryAddr, 50);

//         //await tokenVesting.connect(beneficiary).withdraw(vestingScheduleId);

//           console.log(3)

//         // owner withdraw vested tokens (50)
//         await expect(tokenVesting.connect(owner).withdraw(vestingScheduleId))
//           .to.emit(testToken, "Transfer")
//           .withArgs(vestingAddr, beneficiaryAddr, 0);
//         vestingSchedule = await tokenVesting.getVestingSchedule(
//           vestingScheduleId
//         );

//         await tokenVesting.connect(owner).withdraw(vestingScheduleId);


        


//         // check that the vested amount is 0
//         expect(
//           await tokenVesting
//             .connect(beneficiaries[i])
//             .computeReleasableAmount(vestingScheduleId)
//         ).to.be.equal(0);


//         vestingSchedule = await tokenVesting.getVestingSchedule(
//           vestingScheduleId
//         );

//         expect(await vestingSchedule.withdrawn).to.be.equal(100);

//       }

//       /*
//        * TEST SUMMARY
//        * deploy vesting contract
//        * send tokens to vesting contract
//        * create new vesting schedule (100 tokens)
//        * check that vested amount is 0
//        * set time to half the vesting period
//        * check that vested amount is half the total amount to vest (50 tokens)
//        * check that only beneficiary can try to withdraw vested tokens
//        * check that beneficiary cannot withdraw more than the vested amount
//        * withdraw 10 tokens and check that a Transfer event is emitted with a value of 10
//        * check that the withdrawd amount is 10
//        * check that the vested amount is now 40
//        * set current time after the end of the vesting period
//        * check that the vested amount is 90 (100 - 10 withdrawd tokens)
//        * withdraw all vested tokens (90)
//        * check that the number of withdrawd tokens is 100
//        * check that the vested amount is 0
//        * check that anyone cannot revoke a vesting
//        */
  });
});
