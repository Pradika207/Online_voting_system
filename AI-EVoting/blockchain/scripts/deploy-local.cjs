const hre = require('hardhat');

async function main() {
  const Voting = await hre.ethers.getContractFactory('Voting');
  const voting = await Voting.deploy();
  await voting.waitForDeployment();
  const address = await voting.getAddress();
  console.log('DEPLOYED_ADDRESS=' + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
