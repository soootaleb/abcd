import Observe from "https://deno.land/x/Observe/Observe.ts";
import type {
  IKVWatch,
  ILog,
  IMessage,
  IMonOp,
  IMonWatch,
  IOPayload,
} from "./interfaces/interface.ts";
import Net from "./net.ts";
import Store from "./store.ts";
import Discovery from "./discovery.ts";
import { EComponent, EMonOpType, EMType, ENodeState, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";
import Monitor from "./monitor.ts";
import Watcher from "./watcher.ts";

export default class Node extends Messenger {

  private leader = "";
  private requests: { [key: string]: string } = {};

  private net: Net;
  private mon: Monitor;
  private store: Store;
  private watcher: Watcher;
  private state: ENodeState = ENodeState.Starting;
  private discovery: Discovery;

  private term = 0;
  private votesCounter = 0;
  private heartBeatCounter = 1;
  private heartBeatInterval: number = this.args["hbi"] ? this.args["hbi"] : 30;
  private heartBeatIntervalId: number | undefined;
  private electionTimeout: number = this.args["etimeout"]
    ? this.args["etimeout"]
    : (Math.random() + 0.150) * 1000;
  private electionTimeoutId: number | undefined;

  private discoveryBeaconIntervalId: number | undefined;

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

    this.net = new Net(messages);
    this.store = new Store(messages);
    this.discovery = new Discovery(messages);
    this.watcher = new Watcher(messages);

    this.mon = new Monitor(messages);
  }

  /**
   * I prefer to keep this in method (private) to ensure only node can call it
   * @param to state to transition to
   */
  private transitionFunction(to: ENodeState) {

    this.send(EMType.NewState, {
      from: this.state,
      to: to,
    }, EComponent.Logger);

    clearTimeout(this.electionTimeoutId);
    clearInterval(this.heartBeatIntervalId);
    clearInterval(this.discoveryBeaconIntervalId);

    this.store.reset();

    switch (to) {
      case ENodeState.Starting:
        break;
      case ENodeState.Follower:
        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction(ENodeState.Candidate);
        }, this.electionTimeout);

        this.state = ENodeState.Follower;
        break;
      case ENodeState.Leader:
        this.heartBeatIntervalId = setInterval(() => {
          for (const peerIp of Object.keys(this.net.peers)) {
            this.send(EMType.HeartBeat, null, peerIp);
            this.heartBeatCounter += 1;
          }
        }, this.heartBeatInterval);

        this.discoveryBeaconIntervalId = setInterval(() => {
          this.send(EMType.DiscoveryBeaconSend, null, EComponent.Discovery);
        }, this.heartBeatInterval);

        this.term += 1;

        this.state = ENodeState.Leader;

        for (const peerIp of Object.keys(this.net.peers)) {
          this.send(EMType.NewTerm, {
            term: this.term,
          }, peerIp);
          this.heartBeatCounter += 1;
        }

        break;
      case ENodeState.Candidate:
        this.state = ENodeState.Candidate;
        this.votesCounter = 1;

        if (Object.keys(this.net.peers).length == 0) {
          this.transitionFunction(ENodeState.Leader);
        } else {
          for (const peerIp of Object.keys(this.net.peers)) {
            this.send(EMType.CallForVoteRequest, {
              term: this.term,
              peerIp: peerIp,
            }, peerIp);
          }
        }

        break;
      default:
        this.send(EMType.InvalidTransitionToState, {
          currentState: this.state,
          transitionTo: to,
        }, EComponent.Logger);
    }
  }

  [EMType.ClientRequest]: H<EMType.ClientRequest> = (message) => {
    switch (message.payload.type) {
      case EOpType.KVOp: {
        if (this.state == ENodeState.Leader) {
          this.requests[message.payload.token] = message.source;
          // [TODO] Implement EMType.KVOpRequest (to allow components to store data)
          this.store.kvop(
            message.payload as {
              token: string;
              type: EOpType.KVOp;
              payload: IOPayload[EOpType.KVOp];
              timestamp: number;
            },
          );
        } else {
          this.requests[message.payload.token] = message.source;
          this.send(message.type, message.payload, this.leader);
          this.send(EMType.ClientRequestForward, {
            message: message,
          }, EComponent.Logger);
        }
        break;
      }
      case EOpType.KVWatch: {
        const payload = message.payload.payload as IKVWatch;
        this.watcher.watch(payload.key, message.source, payload.expire);
        break;
      }
      case EOpType.MonOp: {
        const payload = message.payload.payload as IMonOp;
        this.send(EMType.ClientResponse, {
          token: message.payload.token,
          payload: {
            op: EMonOpType.Get,
            metric: {
              key: payload.metric.key,
              value: this.mon.get(payload.metric.key)
            }
          },
          type: message.payload.type,
          timestamp: new Date().getTime()
        }, message.source)
        break;
      }
      case EOpType.MonWatch: {
        const payload = message.payload.payload as IMonWatch;
        this.mon.watch(payload.key, message.source, payload.expire);
        break;
      }
      default:
        this.send(EMType.InvalidClientRequestType, {
          invalidType: message.payload.type,
        }, EComponent.Logger);
        break;
    }
  };

  [EMType.HeartBeat]: H<EMType.HeartBeat> = (message) => {
    if (
      this.state === ENodeState.Candidate ||
      this.state === ENodeState.Starting ||
      this.state === ENodeState.Follower
    ) {
      this.transitionFunction(ENodeState.Follower);
      return;
    }
  };

  /**
   * [TODO] Before accepting, the follower should
   * - Verify the term (split brain)
   * - Verify the entry is the latest (timestamp)
   * - ... check RAFT paper
   * @param message 
   */
  [EMType.AppendEntry]: H<EMType.AppendEntry> = (message) => {
    this.transitionFunction(ENodeState.Follower);
    if(message.payload.log.commited) {
      this.store.commit(message.payload);
    } else {
      this.send(EMType.KVOpAccepted, message.payload, message.source)
    }
  }

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    const log: ILog = message.payload.log;
    const votes: number = this.store.voteFor(log.next.key);

    // [TODO] Find a cleaner logic
    if(message.source === EComponent.Store) {
      for (const peer of Object.keys(this.net.peers)) {
        this.send(EMType.AppendEntry, {
          log: log,
          token: message.payload.token,
        }, peer);
      }
    }

    if (votes === -1) { // Key is not currently under vote
      this.send(
        EMType.KVOpAcceptedReceivedButCommited,
        message.payload,
        EComponent.Logger,
      );
    } else if (votes >= this.net.quorum) {
      const entry = this.store.commit({
        log: log,
        token: message.payload.token,
      })
      for (const peer of Object.keys(this.net.peers)) {
        this.send(EMType.AppendEntry, entry, peer);
      }
      this.send(EMType.KVOpRequestComplete, entry, EComponent.Node);
    }
  };

  [EMType.KVOpRequestComplete]: H<EMType.KVOpRequestComplete> = (message) => {
    this.send(EMType.ClientResponse, {
      token: message.payload.token,
      type: EOpType.KVOp,
      payload: {
        kv: message.payload.log.next,
        op: message.payload.log.op,
      },
      timestamp: new Date().getTime(),
    }, this.requests[message.payload.token]);

    delete this.requests[message.payload.token];
  };

  [EMType.NewTerm]: H<EMType.NewTerm> = (message) => {
    if (message.payload.term > this.term) {
      this.term = message.payload.term;

      this.send(EMType.NewTermAccepted, {
        term: this.term,
        leader: this.net.peers[message.source],
      }, EComponent.Logger);

      // TODO Implement WAL sync here

      this.transitionFunction(ENodeState.Follower);
    } else {
      this.send(EMType.NewTermRejected, {
        term: this.term,
      }, message.source);
    }
  };

  [EMType.CallForVoteRequest]: H<EMType.CallForVoteRequest> = (message) => {
    this.send(EMType.CallForVoteResponse, {
      voteGranted: this.state != ENodeState.Leader &&
        message.payload.term >= this.term,
    }, message.source);
  };

  [EMType.CallForVoteResponse]: H<EMType.CallForVoteResponse> = (message) => {
    if (this.state == ENodeState.Candidate) {
      if (message.payload.voteGranted) {
        this.votesCounter += 1;
      }

      if (this.votesCounter >= this.net.quorum) {
        this.votesCounter = 0;
        this.transitionFunction(ENodeState.Leader);
      }
    } else {
      this.send(EMType.VoteReceivedButNotCandidate, {
        callForVoteReply: message,
        currentState: this.state,
      }, EComponent.Logger);
    }
  };

  [EMType.PeerConnectionAccepted]: H<EMType.PeerConnectionAccepted> = (
    message,
  ) => {
    this.term = message.payload.term;

    this.store.sync(message.payload.wal);

    this.send(EMType.PeerConnectionComplete, {
      peerIp: message.source,
    }, EComponent.Net);

    for (const peerIp of Object.keys(message.payload.knownPeers)) {
      if (!Object.keys(this.net.peers).includes(peerIp)) {
        this.send(EMType.PeerConnectionRequest, {
          peerIp: peerIp,
        }, EComponent.Net);
      }
    }
  };

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    // Duplicate known peers before adding the new one (it already knows itself...)
    const knownPeers = { ...this.net.peers };

    // newPeer can be received twice from same peer
    // That's because knownPeers are added in parallel
    // Hence, a peer can connect a second time because its first co didn't make it before
    // another peer replies with the same knownPeer.
    // Duplicate conn are not a problem but duplicate newPeers will
    // send the peer to itself, thus making it create a self-loop
    delete knownPeers[message.payload.peerIp];

    this.send(EMType.PeerConnectionAccepted, {
      term: this.term,
      knownPeers: knownPeers,
      wal: this.store.wal,
    }, message.payload.peerIp);
  };

  [EMType.PeerServerStarted]: H<EMType.PeerServerStarted> = (message) => {
    if (this.net.ready && this.discovery.ready) {
      this.discovery.discover();
    }
  };

  [EMType.DiscoveryServerStarted]: H<EMType.DiscoveryServerStarted> = (
    message,
  ) => {
    if (this.net.ready && this.discovery.ready) {
      this.discovery.discover();
    }
  };

  [EMType.DiscoveryResult]: H<EMType.DiscoveryResult> = (message) => {
    // If node is leader or knows a leader, break
    if (this.state === ENodeState.Leader || this.leader.length) {
      this.send(EMType.DiscoveredResultIgnored, {
        result: message.payload,
        state: this.state,
        leader: this.leader,
      }, EComponent.Logger);
      return;
    }

    // If discovery found a node, connect to it
    if (message.payload.success) {
      this.send(EMType.PeerConnectionRequest, {
        peerIp: message.payload.result,
      }, EComponent.Net);
    }

    // either way, discovery is finished so node is ready
    this.send(EMType.NodeReady, {
      ready: true,
    }, EComponent.NetWorker);

    // discovery finishes by passing follower (may move to leader if no node found)
    this.transitionFunction(ENodeState.Follower);
  };

  [EMType.ClientResponse]: H<EMType.ClientResponse> = (message) => {
    this.send(
      message.type,
      message.payload,
      this.requests[message.payload.token],
    );
    delete this.requests[message.payload.token];
  };
}
