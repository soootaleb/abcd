# abcd

Key Value Store with raft in TypeScript for Deno runtime (inspired by etcd, for pedagogical purpose only)

# Implemented

- Leader starts & listens on 8080 (if port 8080 is provided as args[0])
- Follower starts & listens on random port (if no argv[0] is provided)
- Follower connects to leader on port 8080
- Follower receives "knownPeers" (with peerPort)
- Follower connects to all peers (on peerPort)

> Now a leader can be started & nodes added to cluster will be connected to leader and all other peers

- Leader stends heartbeats to all peers
- Peers become candidates if not heartbeat before the electionTimeout
- Peers send a callForVoteRequest to all knownPeers
- Peers send a callForVoteReply (grantVote == true) to any callForVoteRequest received
- Peer becomes leader if the callForVoteReply count reaches a majority (more than half of the cluster size)
- Peer elected leader increments the term
- Peer elected sends "newTerm" to all knownPeers
- Peer receiving "newTerm" becomes follower, updates its term & leaderPort

> Now a peer is elected leader automatically if the leader is lost


# Next steps

- Message broker instead of postMessage():
- Cleaner & global logging
- OOriented API to send messages (e.g FIXME #1)
- Implement a frontend
- Abstract a frontend interaction (fetch states, monitoring, ...)

# Known issues

1. on "connectionAccepted" the [main]->[net] "addPeer" for connecting to "knownPeers" provided by leader is not logged