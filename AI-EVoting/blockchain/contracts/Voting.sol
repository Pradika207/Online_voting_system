// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {

    struct Vote {
        uint256 voterId;
        uint256 candidateId;
        uint256 timestamp;
    }

    Vote[] public votes;

    mapping(uint256 => bool) public hasVoted;

    event VoteCast(
        uint256 indexed voterId,
        uint256 indexed candidateId,
        uint256 timestamp
    );

    function castVote(
        uint256 voterId,
        uint256 candidateId
    ) public {

        require(
            !hasVoted[voterId],
            "Voter has already voted"
        );

        votes.push(
            Vote(
                voterId,
                candidateId,
                block.timestamp
            )
        );

        hasVoted[voterId] = true;

        emit VoteCast(
            voterId,
            candidateId,
            block.timestamp
        );
    }

    function getVoteCount() public view returns (uint256) {
        return votes.length;
    }

    function getVote(
        uint256 index
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        Vote memory vote = votes[index];

        return (
            vote.voterId,
            vote.candidateId,
            vote.timestamp
        );
    }
}
