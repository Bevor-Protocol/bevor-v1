// const chai = require('chai');
// const chaiAsPromised = require('chai-as-promised');
// chai.use(chaiAsPromised)
// const { expect, assert } = chai

// // ******* Proposal ethers example: ********

// // const tokenAddress = ...;
// // const token = await ethers.getContractAt(‘ERC20’, tokenAddress);

// // const teamAddress = ...;
// // const grantAmount = ...;
// // const transferCalldata = token.interface.encodeFunctionData(‘transfer’, [teamAddress, grantAmount]);

// // await governor.propose(
// //     [tokenAddress],
// //     [0],
// //     [transferCalldata],
// //     “Proposal #1: Give grant to team”,
// //   );

// const ERC20Token = artifacts.require("ERC20Token");
// const Audit = artifacts.require("Audit");
// const AuditPayment = artifacts.require("MockAuditPayment");
// const BevorDAO = artifacts.require("BevorDAO");
// const TimelockController = artifacts.require("TimelockController");

// contract('Testing AuditVesting contract', function(accounts) {
//     let tc;
//     let dao;
//     let nft;
//     let ap;

//     let bvr;
//     const name = "Bevor Token";
//     const symbol = "BVR"

//     let tusd;
//     const name1 = "Test USD Token";
//     const symbol1 = "TUSD"

//     const account = accounts[0];
//     const tokenAlloc = 400000 * 10 ** 18;

//     const account1 = accounts[1];
//     const tokenAlloc1 = 100000 * 10 ** 18;

//     const account2 = accounts[2];
//     const tokenAlloc2 = 300000 * 10 ** 18;

//     const account3 = accounts[3];
//     const tokenAlloc3 = 200000 * 10 ** 18;

//     let vs;
//     let vsId;

//     beforeEach(async () => {
//         bvr = await ERC20Token.new(1000000, name, symbol);
//         tusd = await ERC20Token.new(1000000, name1, symbol1);
//         tc = await TimelockController.new(1, [account2], [account1], account);
//         dao = await BevorDAO.new(bvr.address, tc.address); 
//         nft = await Audit.new();
//         ap = await AuditPayment.new(dao.address, nft.address);

//         // Auditor account withdraw 10 testUSD tokens after they are released
//         await nft.mint(account1, {from: account});

//         expect(await nft.symbol()).to.equal("BAD");
//         expect(await nft.name()).to.equal("BevorAuditDeliverable");

//         await tusd.approve(ap.address, 1000, {from: account});
//         await nft.setApprovalForAll(ap.address, true, {from: account1});

//         const curTime = parseInt(await ap.getCurrentTime());

//         console.log("Cur time: " + curTime);

//         await ap.createVestingSchedule(account1, curTime, 0, 1000, 10, 1000, tusd.address, 1, {from: account});

//         // const vs = await ap.vestingSchedules(await ap.computeVestingScheduleIdForAddressAndIndex(
//         //     account,
//         //     1
//         // ));

//         vsId = await ap.vestingSchedulesIds(0);

//         console.log("VSID: " + vsId);

//         vs = await ap.vestingSchedules(vsId);
//     });

//     it(' should be able to deploy and create audit payment', async () => {
//         expect(vs.auditor).to.equal(account1);
//         expect(vs.auditee).to.equal(account);
//         expect(parseInt(vs.duration)).to.equal(1000);
//         expect(vs.token).to.equal(tusd.address);
//         expect(parseInt(vs.tokenId)).to.equal(1);
//     });

//     it(' should be able to withdraw tokens as payment vests', async () => {
//         const balAP = parseInt(await tusd.balanceOf(ap.address));

//         const relAmt = await ap.computeReleasableAmount(vsId);

//         console.log("Releasable amt: " + relAmt);
//         console.log("BALAP: " + balAP);

//         await ap.withdraw(vsId, {from: account1});

//         const bal = parseInt(await tusd.balanceOf(account1));

//         //TODO: Figure out how to manage this cliff correctly and if timeout is working

//         //expect(bal).to.equal(20);

//     });

//     it(' should freeze vesting withdrawls for auditor when proposal is created on DAO', async () => {
//         // Auditor withdrawl should fail once proposal is created
//     });

//     it(' should return remaining unvested tokens to auditee for payment if successful DAO proposal deems it invalid', async () => {
//         // Return 990 testUSD tokens to auditee once proposal is successfully voted by BVR holders
//     });

//     it(' should unfreeze vesting withdrawls for auditor if DAO proposal is unsuccessful', async () => {
//     });
// })