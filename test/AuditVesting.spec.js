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

    let bvr;
    const name = "Bevor Token";
    const symbol = "BVR"

    let tusd;
    const name1 = "Test USD Token";
    const symbol1 = "TUSD"

    const account = accounts[0];
    const tokenAlloc = 400000;

    const account1 = accounts[1];
    const tokenAlloc1 = 100000;

    const account2 = accounts[2];
    const tokenAlloc2 = 300000;

    const account3 = accounts[3];
    const tokenAlloc3 = 200000;

    beforeEach(async () => {
        bvr = await ERC20Token.new();
        tusd = await ERC20Token.new();
        
    });

    it(' should be able to deploy and create audit payment', async () => {
        // Create audit payment for 1000 testUSD tokens
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