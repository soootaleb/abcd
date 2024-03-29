# abcd

![status](https://www.travis-ci.com/soootaleb/abcd.svg?branch=master)

Key Value Store with raft in TypeScript for Deno runtime (inspired by etcd, for pedagogical purpose only)

# Getting Started

You can start by just running the docker image with `main.ts`; Alternatively you can use the CLI by passing `cli/abcd.ts`. In both cases, the docker image passes parameters to the Deno runtime so you can use

- `--console-messages [full]` to log messages in console (adding _full_ arg will display payloads)
- `--data-dir=/root` to custom the store persistance directory
- `--etimeout=30` to set the election timeout

## Starting one node

`deno run abcd main.ts`

## Connecting a new node

By default starting a node will use UDP discovery by listening for UDP packets from a leader; After the election timeout the node will go leader if no discovery has been made. **If your nodes are in the same group for a multicast 224.0.0.1** you can just start the container like the first one

`deno run abcd main.ts`

If you prefer to use HTTP discovery, you need to provide nodes with `ABCD_NODE_IP` and `ABCD_CLUSTER_HOSTNAME` as environement variables. HTTP discovery is used if argument `--discovery http` is present

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

- Starting node opens abcd.wal file append only
- Starting node opens & reads store.json (loads content in memory)

> Cluster is able to receive put & get requests and persist data between executions

- Logs are appended at each request
- HeartBeat doesn't send a buffer anymore
- WAL file written & fsync() synchronously
- Store file written every 1000ms asynchronously

> Node bottleneck is reached around 20-30 requests / sec

- WAL file written & fsync() in batch
- Node waits for all peers to be connected before going to Follower
- Node waits for 3x HeartBeatInterval before considering UDP discovery achieved
- WAL Sync is performed in batch
- Candidates do not grant votes
- Node grants votes once per term

> Node bottleneck is reached around 100-200 requests / sec & leader election is more stable

# Version

- v14.0: Use DDAPPS lib
    - v14.1: Fix entrypoint
    - v14.2: Upgrade ddapps:1.4.0 & Deno 1.20.1
    - v14.3: Upgrade ddapps:1.4.1
- v13.0: Extract ABCD as lib
- v12.0: Blockchain
    - v12.1: Fix unit test
    - v12.2: Fix product version
    - v12.3: CLI now uses Cliffy & first e2e test implementation (using Client)
    - v12.4: Fix Deno & libs versions + update Dockerfile default CMD
- v11.0: No workers
    - Allows deno compile
    - Allows docker from scratch
    - Simpler net handling
    - v11.1: Merged unit tests exploration (WIP)
    - v11.2: Tests OK + abcd version display
- v10.0: Async messages
    - v10.1: (feature) Generic monitoring forward & state keys access
- v9.0: Central state for all components
    - v9.1: (fix) knownPeers without -rid that caused a partial split brain
- v8.0:
    - WAL sync batching
    - Multiple connections from one clientIp
    - Removed StoreWorker
- v7.0:
    - Upgraded leader election
        - electionTimeout for candidates
        - voteGranted only once per term
    - Sync WAL in RAM
    - End discovery once all peers are connected
    - NodeReady once all peers are connected
- v6.0:
    - (deps) Use Deno v1.8.1
    - (fix) Handle KVOpRejected (answer client)
    - (feature) NewTermRejected if node is candidate
    - v6.1: (fix) etimeout stays random even when specified as argument
    - v6.2: (fix) fixed etimeout random calculation
    - v6.3: (feature) Wal sync in bulk
    - v6.4: (feature) Adds new Api component to handle client requests
- v5.0: Use Deno native events with addEventListener & dispatch
- v4.0: Synchronous replication & writes
- v3.0: Persistance layer
    - v3.4:
        - (feature) KVWatch operations
        - (feature) New message of type ClientNotification
    - v3.5: (feature) KVWatch operations on followers
    - v3.6: (feature) MonOp / MonWatch (/deno/*, /abcd/logs] implementation
- v2.0: Consensus layer
- v1.0: Network layer

# Next steps

## Architecture

- KVOpRequests tracing (mon, responses, ...)
- Add file logging
- More coherent message naming
- More coherent monitoring approach (e.g logs in store)

## Features

- Get state values with clients
- Applied logs in store should be remove from WAL (need to match logApplied with correct log)
- Upgrade voting strategy (known issue #2)
- Send latest commited log along with uncommited WAL entries
- Network partitions
- Network latency
- MVCC
- WASI
- Pub/Sub
- IAM
- Indexes
- ORM
- Query language
- Requests tracer

# Known issues

2. Upgrade the voting strategy:
 - grant vote only if latest log is before latest log from candidate calling for vote (https://youtu.be/RHDP_KCrjUc?t=1063)
3. Upgrade log commitment safety (https://youtu.be/RHDP_KCrjUc?t=1157)
 - Accept a log only if it's from the current term ?
 - Commit a log only if it's from the current term
4. Peers & Clients suffix (for multi conns from same IP) seems to create problems

# Release process

- product version
- git tag
- deno test