# Bevor Protocol

Bevor is a decentralized (semi) permission-less protocol and DAO that creates long-lasting incentive structures for audits, which is mutually favorable for all parties involved. This levels the playing field for auditees and auditors as well as improving the incentives, security, and quality of audits. We massively de-risk the financial burden of paying for audits, decentralize the auditing process, and incentivize DAO participation to uncover contract exploits and vulnerabilities.

***In order to test the protocol with mock vesting and DAO proposals:***

```shell
npx hardhat test
```

**To run this locally:**

Start the local HTTP and WebSocket JSON RPC node
```shell
npx hardhat node
```
This will output the test wallet addresses. They'll be fixed as we set a mnemonic.

In a new terminal, run the deploy script to localhost
```shell
npx hardhat run scripts/deploy.ts --network localhost
```
This will output the contract addresses to the same terminal where the local node is running.