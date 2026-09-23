const { ethers } = require("ethers");
require("dotenv").config();

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || process.env.BLOCKCHAIN_PROVIDER_URL || "http://127.0.0.1:8545";
const contractAddress = process.env.CONTRACT_ADDRESS || undefined;

const contractABI = [
    "function castVote(uint256 voterId, uint256 candidateId) public",
    "function getVoteCount() public view returns (uint256)",
    "function getVote(uint256 index) public view returns (uint256, uint256, uint256)",
    "function hasVoted(uint256 voterId) public view returns (bool)",
    "event VoteCast(uint256 indexed voterId, uint256 indexed candidateId, uint256 timestamp)"
];

let provider = null;
let votingContract = null;

async function createContract() {
    if (!contractAddress) {
        votingContract = null;
        return;
    }

    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        const network = await provider.getNetwork();

        if (!network || !network.chainId) {
            votingContract = null;
            return;
        }

        const pk = process.env.PRIVATE_KEY || process.env.BLOCKCHAIN_PRIVATE_KEY;

        if (pk && pk.length && pk !== "[ REDACTED ]") {
            try {
                const wallet = new ethers.Wallet(pk, provider);
                votingContract = new ethers.Contract(contractAddress, contractABI, wallet);
                return;
            } catch (e) {
                console.warn("Invalid PRIVATE_KEY/BLOCKCHAIN_PRIVATE_KEY; using provider signer fallback.");
            }
        }

        try {
            const accounts = await provider.listAccounts();
            if (accounts && accounts.length > 0) {
                const signer = provider.getSigner(0);
                votingContract = new ethers.Contract(contractAddress, contractABI, signer);
                return;
            }
        } catch (e) {
            console.warn("Could not list provider accounts; using read-only provider.");
        }

        votingContract = new ethers.Contract(contractAddress, contractABI, provider);
    } catch (e) {
        votingContract = null;
        console.warn("Blockchain network unavailable; demo mode remains active.", e.message || e);
    }
}

createContract().catch(() => {
    votingContract = null;
});

async function getBlockchainVotes() {
    if (!votingContract) return [];

    try {
        const filter = votingContract.filters ? votingContract.filters.VoteCast() : null;

        if (!filter) return [];

        const events = await votingContract.queryFilter(filter);

        return events.map((event) => ({
            voterId: event.args[0].toString(),
            candidateId: event.args[1].toString(),
            timestamp: event.args[2].toString(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
        }));
    } catch (error) {
        console.warn("Unable to fetch blockchain votes in demo mode.", error.message || error);
        return [];
    }
}

module.exports = {
    get votingContract() {
        return votingContract;
    },
    getBlockchainVotes
};
