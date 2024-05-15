import { AddressType } from "typechain";

const { expect } = require("chai");
const { ethers, BigNumber } = require("hardhat");

// Fork of https://github.com/abdelhamidbakhta/token-vesting-contracts/blob/5107b251b18ea599095661b407625ddb994b516b/test/TokenVesting.js

describe("AuditNFT Functionality", function () {
  let Token: any;
  let DAO: any;
  let TL: any;
  let Audit: any;
  let testToken: any;
  let timelock: any;
  let bevorDAO: any;
  let bevorProtocol: any;
  let auditNFT: any;
  let BevorProtocol: any;
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
    BevorProtocol = await ethers.getContractFactory("BevorProtocol");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    testToken = await Token.deploy(totalSupply, "Test Token", "TT");
    await testToken.waitForDeployment();
    
    timelock = await TL.deploy(0, [], [], "0x341Ab3097C45588AF509db745cE0823722E5Fb19");
    await timelock.waitForDeployment();
    
    bevorDAO = await DAO.deploy(await testToken.getAddress(), await timelock.getAddress());
    await bevorDAO.waitForDeployment();

    auditNFT = await Audit.deploy();
    await auditNFT.waitForDeployment();

    bevorProtocol = await BevorProtocol.deploy(await bevorDAO.getAddress(), await auditNFT.getAddress());
    await bevorProtocol.waitForDeployment();
  });

  describe("AuditNFT", function () {
    it("Audit constructor should transfer ownership to BevorProtocol", async () => {

      await auditNFT.transferOwnership(await bevorProtocol.getAddress());

      const auditOwner = await auditNFT.owner();

      expect(auditOwner).to.equal(await bevorProtocol.getAddress());
    });

    it("Can't call mint directly", async() => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());

      const mockId = await auditNFT.generateProof("some random string", 100000);

      // fails unless await is outside expect?
      await expect(auditNFT.connect(addr1).mint(addr1, mockId)).to.be.revertedWith(
         "Ownable: caller is not the owner"
      );
    });

    it("Can transfer ERC20 from contract to auditee", async () => {
      const auditee = addr1;
      await testToken.transfer(auditee, 10000);

      expect(await testToken.balanceOf(auditee)).to.equal(10000);
    });

    it("Confirm allowance of auditee to send ERC20", async () => {

      // First we send the ERC20 to the auditee
      // Then we need to approve the auditee to send ERC20 to the bevorProtocol
      // Then we can confirm the allowance

      const auditee = addr1;
      const amount = 10000;
      const spender = await bevorProtocol.getAddress();
      await testToken.transfer(auditee, amount + 10);
      await testToken.connect(auditee).approve(spender, amount);

      expect(await testToken.allowance(auditee, spender)).to.equal(amount);
    });

    it("Confirm ability to transfer ERC20 from audit to bevorProtocol", async () => {

      // First we send the ERC20 to the auditee
      // Then we need to approve the auditee to send ERC20 to the bevorProtocol
      // Then we can confirm the allowance

      const auditee = addr1;
      const amount = 10000;
      const spender = await bevorProtocol.getAddress();

      await testToken.transfer(auditee, amount + 10);
      await testToken.connect(auditee).approve(auditee, amount);
      await testToken.connect(auditee).transferFrom(auditee, spender, amount);
      expect(await testToken.balanceOf(spender)).to.be.at.least(amount);
    });

    // following include some redundancy, but can't use reveal() unless minting occured
    it("Able to generate auditId", async () => {

      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";

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

      expect(auditId).to.exist;
    });

    it("Bevor Protocol prepares audit, matching externall called auditId", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";

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

      // have to move the await back inside the expect()
      expect(await bevorProtocol.connect(auditee).prepareAudit(
        auditors,
        cliff,
        duration,
        details,
        amount,
        tokenAddress,
        salt,
      )).to.emit("AuditCreated").withArgs(auditId);
    });

    it("Able to generate tokenId", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

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
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      expect(tokenId).to.exist;

    });

    it("Bevor Protocol revealFindings() fails without token balance", async () => {
      await auditNFT.transferOwnership(await bevorProtocol.getAddress());
      const tokenAddress = await testToken.getAddress();

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

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

      await expect(bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )).to.be.revertedWith("ERC20: insufficient allowance");

    });

    it("Bevor Protocol can call mint() from Audit.sol contract after approval", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

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

      // start time should be zero
      expect((await bevorProtocol.audits(auditId))[5]).to.equal(0);
      
      const tokenId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);
      // await testToken.transfer(auditee, amount + 10);
      // await testToken.connect(auditee).approve(auditee, amount);
      // await testToken.connect(auditee).transferFrom(auditee, spender, amount);

      const now = Math.round(new Date().getTime() / 1000);

      await bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        auditId,
      )

      expect((await bevorProtocol.audits(auditId))[5]).to.be.greaterThan(now);
      
      expect(await auditNFT.ownerOf(tokenId)).to.equal(auditee);
      expect(await auditNFT.tokenOfOwnerByIndex(auditee, 0)).to.equal(tokenId);
    });

    it("Can't spoof auditId in mint()", async () => {
      const bevorProtocolAddress = await bevorProtocol.getAddress();
      await auditNFT.transferOwnership(bevorProtocolAddress);
      const tokenAddress = await testToken.getAddress();
      

      const auditee = addr1;
      const auditors = [addrs[0], addrs[1]];
      const cliff = 1000;
      const duration = 10000;
      const details = "here are my details";
      const amount = 100000;
      const salt = "some random salt";
      const findings = ["finding 1", "finding 2"];

      await testToken.transfer(auditee, amount + 10);

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

      // start time should be zero
      expect((await bevorProtocol.audits(auditId))[5]).to.equal(0);
      
      const randomId = await bevorProtocol.generateTokenId(
        auditId,
        findings,
      )

      await testToken.connect(auditee).approve(bevorProtocolAddress, amount);

      await expect(bevorProtocol.connect(auditee).revealFindings(
        auditors,
        findings,
        randomId,
      )).to.be.revertedWith("Only the auditee can mint this NFT");
    })

    // it('Trustless handoff should change to reveal URI', async () => {
    //     //Switches to https://ipfs.io/ipfs/ from https://api.bevor.io/ upon reveal
    //     const tokenVestingAddress = await tokenVesting.getAddress()
        
    //     auditNFT = await Audit.deploy(tokenVestingAddress);
    //     await auditNFT.waitForDeployment();

    //     const auditee = addr1;
    //     const auditors = [addrs[0], addrs[1]];

    //     const cliff = 10;
    //     const duration = 1000;
    //     const slicePeriodSeconds = 1;
    //     const amount =  100;
    //     const salt = 5000;
    //     const details = "some random content";

    //     await testToken.approve(tokenVestingAddress, 1000);
    //     const conBalance = await testToken.balanceOf(owner);
    //     console.log(conBalance);
    //     await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

    //     const testTokenAddress = await testToken.getAddress();

    //     const auditId = await auditNFT.generateAuditId(
    //       auditee,
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );

    //     await auditNFT.connect(auditee).createAudit(
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );
        
    //     const tokenId = await auditNFT.generateTokenId(
    //       auditee,
    //       ["findings1", "findings2"],
    //       auditId,
    //       salt,
    //     );

    //     await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

    //     // let tokenId = await auditNFT.generateProof("b", 321);

    //     expect(await auditNFT.tokenURI(tokenId)).to.equal(`https://api.bevor.io/${tokenId}`);

    //     await auditNFT.connect(auditee).trustlessHandoff(auditee, owner, tokenId);

    //     expect(await auditNFT.tokenURI(tokenId)).to.equal(`https://ipfs.io/ipfs/${tokenId}`);
    // });

    // it('Audit should change hands after trustless handoff', async () => {
    //     //Test this trustlessHandoff(address from, address to, uint256 tokenId)
    //     const tokenVestingAddress = await tokenVesting.getAddress()
        
    //     auditNFT = await Audit.deploy(tokenVestingAddress);
    //     await auditNFT.waitForDeployment();

    //     const auditee = addr1;
    //     const auditors = [addrs[0], addrs[1]];

    //     const cliff = 10;
    //     const duration = 1000;
    //     const slicePeriodSeconds = 1;
    //     const amount =  100;
    //     const salt = 5000;
    //     const details = "some random content";

    //     await testToken.approve(tokenVestingAddress, 1000);
    //     // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

    //     const testTokenAddress = await testToken.getAddress();

    //     const auditId = await auditNFT.generateAuditId(
    //       auditee,
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );

    //     await auditNFT.connect(auditee).createAudit(
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );
        
    //     const tokenId = await auditNFT.generateTokenId(
    //       auditee,
    //       ["findings1", "findings2"],
    //       auditId,
    //       salt,
    //     );

    //     await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

    //     await auditNFT.connect(auditee).trustlessHandoff(auditee, owner, tokenId);

    //     expect(await auditNFT.ownerOf(tokenId)).to.equal(await owner.getAddress());
    // });

    // it('Trustless handoff should only be triggerable by auditor or by vesting contract', async () => {
    //     //Test all the rejection and acceptance cases `
    //     const tokenVestingAddress = await tokenVesting.getAddress()
        
    //     auditNFT = await Audit.deploy(tokenVestingAddress);
    //     await auditNFT.waitForDeployment();

    //     const auditee = addr1;
    //     const auditors = [addrs[0], addrs[1]];

    //     const cliff = 10;
    //     const duration = 1000;
    //     const slicePeriodSeconds = 1;
    //     const amount =  100;
    //     const salt = 5000;
    //     const details = "some random content";

    //     await testToken.approve(tokenVestingAddress, 1000);
    //     // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

    //     const testTokenAddress = await testToken.getAddress();

    //     const auditId = await auditNFT.generateAuditId(
    //       auditee,
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );

    //     await auditNFT.connect(auditee).createAudit(
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );
        
    //     const tokenId = await auditNFT.generateTokenId(
    //       auditee,
    //       ["findings1", "findings2"],
    //       auditId,
    //       salt,
    //     );

    //     await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);

    //     expect(auditNFT.connect(owner).trustlessHandoff(auditee, owner, tokenId)).to.be.revertedWith("ERC721: transfer from incorrect owner");

    //     //Add other test cases here as they arise
    // });

    // it("minting should generate vesting schedules", async () => {
    //     const tokenVestingAddress = await tokenVesting.getAddress()
        
    //     auditNFT = await Audit.deploy(tokenVestingAddress);
    //     await auditNFT.waitForDeployment();

    //     const auditee = addr1;
    //     const auditors = [addrs[0], addrs[1]];

    //     const cliff = 10;
    //     const duration = 1000;
    //     const slicePeriodSeconds = 1;
    //     const amount =  100;
    //     const salt = 5000;
    //     const details = "some random content";

    //     await testToken.approve(tokenVestingAddress, 1000);
    //     // await auditNFT.connect(auditee).setApprovalForAll(tokenVestingAddress, true);

    //     const testTokenAddress = await testToken.getAddress();

    //     const auditId = await auditNFT.generateAuditId(
    //       auditee,
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );

    //     await auditNFT.connect(auditee).createAudit(
    //       auditors,
    //       cliff,
    //       duration,
    //       details,
    //       slicePeriodSeconds,
    //       amount,
    //       testTokenAddress,
    //       salt
    //     );
        
    //     const tokenId = await auditNFT.generateTokenId(
    //       auditee,
    //       ["findings1", "findings2"],
    //       auditId,
    //       salt,
    //     );

    //     await auditNFT.connect(auditee).mint(auditee, auditId, ["findings1", "findings2"], auditors, salt);


    //     expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(2);
    // })

    // Add tests to ensure minting cannot happen before audit is created
  });

});
