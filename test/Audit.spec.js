// import chai from 'chai'
// import chaiAsPromised from 'chai-as-promised'
const truffleAssert = require('truffle-assertions');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised)
const { expect, assert } = chai

var ViridianNFT = artifacts.require("ViridianNFT");

contract('Testing ERC721 contract', function(accounts) {

    let token;
    const name = "Viridian NFT";
    const symbol = "VNFT"

    const account1 = accounts[1]
    const tokenId1 = 1111;
    const tokenUri1 = "This is data for the token 1"; // Does not have to be unique

    const account2 = accounts[2]
    const tokenId2 = 2222;
    const tokenUri2 = "This is data for the token 2"; // Does not have to be unique

    const account3 = accounts[3]

    beforeEach(async () => {
        //console.log(ViridianNFT);
        token = await ViridianNFT.new();
    });

    it(' should be able to deploy and mint ERC721 token', async () => {
        await token.mint(account1, tokenUri1, {from: accounts[0]})

        expect(await token.symbol()).to.equal(symbol)
        expect(await token.name()).to.equal(name)
    });

    it(' should be unique', async () => {
        const duplicateTokenID = token.mint(account2, tokenId1, tokenUri2, {from: accounts[0]}) //tokenId
        console.log("Create " + JSON.stringify(await duplicateTokenID));
        await truffleAssert.reverts(duplicateTokenID, '/VM Exception while processing transaction: revert ERC721: owner query for nonexistent token/');
        console.log(JSON.stringify(duplicateTokenID));
        expect(duplicateTokenID).to.be.rejectedWith(/VM Exception while processing transaction: revert ERC721: owner query for nonexistent token/)
    });

    it(' should allow safe transfers', async () => {
        const unownedTokenId = token.safeTransferFrom(account2, account3, tokenId1, {from: accounts[2]}) // tokenId
        await truffleAssert.reverts(token.safeTransferFrom(account2, account3, tokenId1, {from: accounts[2]}), 'ERC721: operator query for nonexistent token');
        console.log(unownedTokenId);
        expect(unownedTokenId).to.be.rejectedWith(/VM Exception while processing transaction: revert ERC721: owner query for nonexistent token/)
        expect(await token.ownerOf(tokenId2)).to.equal(account2)

        const wrongOwner = token.safeTransferFrom(account1, account3, tokenId2, {from: accounts[1]}) // wrong owner
        expect(wrongOwner).to.be.rejectedWith(/VM Exception while processing transaction: revert ERC721: operator query for nonexistent token -- Reason given: ERC721: operator query for nonexistent token./)
        expect(await token.ownerOf(tokenId2)).to.equal(account1)

        // Noticed that the from gas param needs to be the token owners or it fails
        const wrongFromGas = token.safeTransferFrom(account2, account3, tokenId2, {from: accounts[1]}) // wrong owner
        expect(wrongFromGas).to.be.rejectedWith(/VM Exception while processing transaction: revert ERC721: operator query for nonexistent token -- Reason given: ERC721: operator query for nonexistent token./)
        expect(await token.ownerOf(tokenId2)).to.equal(account2)

        await token.safeTransferFrom(account2, account3, tokenId2, {from: accounts[2]})
        expect(await token.ownerOf(tokenId2)).to.equal(account3)
    });
})