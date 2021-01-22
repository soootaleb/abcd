# abcd

Key Value Store with raft in TypeScript for Deno runtime (inspired by etcd, for pedagogical purpose only)

# Getting Started

Start a node without parameters so it'll enter directly in LEADER mode

## Starting the leader

`deno run --unstable --allow-write --allow-net --allow-read main.ts`

## Connecting a new node

Start another node and provide the `--join` argument specifying the LEADER IP so that the node enters FOLLOWER mode

`deno run --unstable --allow-write --allow-net --allow-read main.ts --join 178.12.0.2`

# Implemented

This list is a chronological feature implementation. Changes are not reflected backward but are only appended to this list. Hence some statements may be false.

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

- UI can start / stop the nodes
- Leader will append ILog to the WAL when setValue, with commited = false
- Heartbeat contains the WAL
- Peer receiving a leader WAL syncs commited changes not already in the local WAL
- Peer receiving a leader WAL registers uncommited changes & returns a vote
- Peer connecting to the cluster will sync the WAL & store of data successfuly

> Settings a key value on the leader will append a commited log in WAL only after consensus

- Node use IPs instead of ports (needs to be Docker containers on a single machine)
- Multiple clients can connect to the leaders
- The leader can send KVOpResponse to precise clients once a KVOpRequest has complete
- Peer .sync() the WAL received from master on peerConnectionAccepted

> Cluster can be deployed on IP machines / containers

- Node start in a "starting" state
- Node moves to "follower" only after peerServer & discoveryServer are started
- Node sends multicast UDP datagrams (beacons) if it's master
- Node connects to the source of a beacon if it doesn't have any peer

> Now all nodes are started the same way and use **peer discovery** to connect to an existing cluster

- Node uses UDP discovery by default (need nodes to be in the same subnet)
- HTTP discovery can be specified with --discovery  (requires ABCD_NODE_IP & ABCD_CLUSTER_HOSTNAME to be defined)

> Cluser discovery can be achieve using two different protocols depending on the environment

# Next steps

## Architecture

- KVOpRequests tracing (mon, responses, ...)
- Differenciate RAFT actions from KVDB actions (get, put, ...)
- Add file logging
- Deploy on Kubernetes

## Features

- Candidate timeout for new callForVote
- Candidate becoming follower on callForVoteRequest (reduces multi candidate problem)
- Upgrade voting strategy (known issue #2)
- Partial WAL replication (in theory send all uncommited along with the latest commited only => requires logic in case of missing logs in follower)
- Atomic WAL replication (send only one log along with latest commited like https://youtu.be/RHDP_KCrjUc?t=892 => need to queue logs replication)
- WAL persistance
- Store persistance
- Network partitions
- Network latency
- MVCC
- WASI

# Known issues

2. Upgrade the voting strategy:
 - grant vote only if latest log is before latest log from candidate calling for vote (https://youtu.be/RHDP_KCrjUc?t=1063)
3. Upgrade log commitment safety (https://youtu.be/RHDP_KCrjUc?t=1157)
 - Accept a log only if it's from the current term ?
 - Commit a log only if it's from the current term
