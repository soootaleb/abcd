# abcd

Key Value Store with raft in TypeScript for Deno runtime (inspired by etcd, for pedagogical purpose only)

# Getting Started

A leader needs to be started first, on port 8080

## Starting the leader

`deno run --unstable --allow-write --allow-net --allow-read main.ts 8080`

## Connecting a new node

If no arg is provided, the node tries to reach the leader on port 8080

`deno run --unstable --allow-write --allow-net --allow-read main.ts`

An arg can be provided to specify a node port (can join a cluster by any node)

`deno run --unstable --allow-write --allow-net --allow-read main.ts 54886`


# Implemented

- Leader starts & listens on 8080 (if port 8080 is provided as args[0])
- Follower starts & listens on random port (if no argv[0] is provided)
- Follower connects to leader on port 8080 (if no argv[0] is provided)
- Follower receives "knownPeers" (with peerPort)
- Follower connects to all peers (on peerPort)

> Now a leader can be started & nodes added to cluster will be connected to leader and all other peers

- Leader sends heartbeats to all peers
- Peers become candidates if not heartbeat received before the electionTimeout
- Peers send a callForVoteRequest to all knownPeers
- Peers send a callForVoteReply (grantVote == true) to any callForVoteRequest received
- Peer becomes leader if the callForVoteReply count reaches a majority (more than half of the cluster size which is knownPeers)
- Peer which is elected leader increments the term
- Peer which is elected sends "newTerm" to all knownPeers
- Peer receiving "newTerm" becomes follower & updates its term

> Now a peer is elected leader automatically if the leader is lost

# Next steps

- Message broker instead of postMessage()
- Use ob RxJS Observables
- Cleaner & global logging
- OOriented API to send messages (e.g FIXME #1)
- Implement a frontend
- Abstract a frontend interaction (fetch states, monitoring, ...)
- Network partitions
- Network latency
- PUT/GET keys
- PUT/GET consensus
- WAL
- WAL replication

# Known issues

1. on "connectionAccepted" the [main]->[net] "connectToPeer" for connecting to "knownPeers" provided by leader is not logged
2. electionTimeout random set is not precise enought and creates simultaneous callForVoteRequests (OK if not even qorum)
3. grant vote only one time before getting a heartbeat (with 5 nodes, got 3-4 terms before stabilizing a leader); due to #2 ?