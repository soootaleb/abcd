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

- Object Oriented implemented with Node & Net. Net has a worker and abstracts it
- Message broker is implemented with Deno Observe, owned by Node and passed to the Net constructor (didn't succeed to install RxJS)
- Logging is now cleaner by _just_ listening to the messages & printing (can be advanced later)
- A newTerm is accepted only if superior than the current node term (necessary later for split brain recovery)
- A node grants a vote (voteGranted = true) only if it's not leader
- A node reacts to callForVoteReply only if its a candidate

> Now a cluster scales to dozens of nodes and reaches a stable & coherent state (conflicts are resolved and all peers agree on the same leader)

> The UI is able to connect to various nodes and display they respective logs

- UI can send a message to define the node state
- UI can send a message to define a key with a value
- Node not leader sends log setValueRequestReceivedButNotLeader
- Node leader sends pendingSetKVRequests in next heartBeat
- Peers commit pendingSetKVRequests in store
- Peers send setKVAccepted to leader
- Leader commits KV in store after quorum is reached

> The cluster is able to store a value in memory with consensus after a qorum has been reached

# Next steps

- Implement a frontend
- PUT/GET keys
- PUT/GET consensus
- WAL
- WAL replication
- OOriented API to send messages (e.g FIXME #1)
- Abstract a frontend interaction (fetch states, monitoring, ...)
- Network partitions
- Network latency

# Known issues

1. electionTimeout random set is not precise enought and creates simultaneous callForVoteRequests (OK if not even qorum)
2. grant vote only one time before getting a heartbeat (with 5 nodes, got 3-4 terms before stabilizing a leader); due to #1 ?