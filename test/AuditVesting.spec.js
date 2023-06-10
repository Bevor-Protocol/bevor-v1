const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised)
const { expect, assert } = chai

// ******* Proposal ethers example: ********

// const tokenAddress = ...;
// const token = await ethers.getContractAt(‘ERC20’, tokenAddress);

// const teamAddress = ...;
// const grantAmount = ...;
// const transferCalldata = token.interface.encodeFunctionData(‘transfer’, [teamAddress, grantAmount]);

// await governor.propose(
//     [tokenAddress],
//     [0],
//     [transferCalldata],
//     “Proposal #1: Give grant to team”,
//   );

const ERC20Token = artifacts.require("ERC20Token");
const Audit = artifacts.require("Audit");
const AuditPayment = artifacts.require("AuditPayment");
const BevorDAO = artifacts.require("BevorDAO");
const TimelockController = artifacts.require("TimelockController");

contract('Testing ERC721 contract', function(accounts) {
    let tc;
    let dao;
    let nft;
    let ap;

    let bvr;
    const name = "Bevor Token";
    const symbol = "BVR"

    let tusd;
    const name1 = "Test USD Token";
    const symbol1 = "TUSD"

    const account = accounts[0];
    const tokenAlloc = 400000 * 10 ** 18;

    const account1 = accounts[1];
    const tokenAlloc1 = 100000 * 10 ** 18;

    const account2 = accounts[2];
    const tokenAlloc2 = 300000 * 10 ** 18;

    const account3 = accounts[3];
    const tokenAlloc3 = 200000 * 10 ** 18;

    beforeEach(async () => {
        bvr = await ERC20Token.new(1000000, name, symbol);
        tusd = await ERC20Token.new(1000000, name1, symbol1);
        tc = await TimelockController.new(1, [account2], [account1], account);
        dao = await BevorDAO.new(bvr.address, tc.address); 
        nft = await Audit.new();
        ap = await AuditPayment.new(dao.address, nft.address);
    });

    it(' should be able to deploy and create audit payment', async () => {
        // Create audit payment for 1000 testUSD tokens
        /*
        function createVestingSchedule(
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
        await nft.mint(account, {from: accounts[0]});

        expect(await nft.symbol()).to.equal("BAD");
        expect(await nft.name()).to.equal("BevorAuditDeliverable");

        console.log(nft.address);

        await ap.createVestingSchedule(account, 0, 10 * 10 ** 18, 1000 * 10 ** 18, 10 * 10 ** 18, 1000 * 10 ** 18, 1000 * 10 ** 18, tusd.address, 1);

        expect(await ap.vestingSchedules(await ap.computeVestingScheduleIdForAddressAndIndex(
            account,
            1
        ))).to.equal({});
    });

    it(' should be able to withdraw tokens as payment vests', async () => {
        // Auditor account withdraw 10 testUSD tokens after they are released
    });

    it(' should freeze vesting withdrawls for auditor when proposal is created on DAO', async () => {
        // Auditor withdrawl should fail once proposal is created
    });

    it(' should return remaining unvested tokens to auditee for payment if successful DAO proposal deems it invalid', async () => {
        // Return 990 testUSD tokens to auditee once proposal is successfully voted by BVR holders
    });

    it(' should unfreeze vesting withdrawls for auditor if DAO proposal is unsuccessful', async () => {
    });
})