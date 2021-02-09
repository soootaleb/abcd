import Observe from "https://deno.land/x/Observe/Observe.ts";
import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import type { ILog, IMessage } from "./interfaces/interface.ts";
import Net from "./net.ts";
import Store from "./store.ts";
import Logger from "./logger.ts";
import Discovery from "./discovery.ts";
import { EComponent, EMType, ENodeState, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Node extends Messenger {
  private args: Args = parse(Deno.args);

  private leader = "";
  private requests: { [key: string]: string } = {};

  private net: Net;
  private store: Store;
  private logger: Logger;
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

    this.logger = new Logger(messages, this.args);

    this.net = new Net(messages);
    this.store = new Store(messages);
    this.discovery = new Discovery(messages);

    this.discovery.protocol = typeof this.args["discovery"] === "string"
      ? this.args["discovery"]
      : Discovery.DEFAULT;
  }

  /**
   * I prefer to keep this in method (private) to ensure only node can call it
   * @param to state to transition to
   */
  private transitionFunction(to: ENodeState) {
    const oldState: ENodeState = this.state;

    clearTimeout(this.electionTimeoutId);
    clearInterval(this.heartBeatIntervalId);
    clearInterval(this.discoveryBeaconIntervalId);

    this.store.reset();

    switch (to) {
      case ENodeState.Starting:
        this.logger.role = ENodeState.Starting;
        break;
      case ENodeState.Follower:
        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction(ENodeState.Candidate);
        }, this.electionTimeout);

        this.state = ENodeState.Follower;
        this.logger.role = ENodeState.Follower;

        this.send(EMType.NewState, {
          oldState: oldState,
          newState: this.state,
        }, EComponent.Logger);

        break;
      case ENodeState.Leader:
        this.heartBeatIntervalId = setInterval(() => {
          for (const peerIp of Object.keys(this.net.peers)) {
            this.send(EMType.HeartBeat, {
              wal: this.store.buffer,
              heartBeatCounter: this.heartBeatCounter,
            }, peerIp);
            this.heartBeatCounter += 1;
          }
        }, this.heartBeatInterval);

        this.discoveryBeaconIntervalId = setInterval(() => {
          this.send(EMType.DiscoveryBeaconSend, null, EComponent.Discovery);
        }, this.heartBeatInterval);

        this.term += 1;

        this.state = ENodeState.Leader;
        this.logger.role = ENodeState.Leader;

        this.send(EMType.NewState, {
          oldState: oldState,
          newState: this.state,
        }, EComponent.Logger);

        for (const peerIp of Object.keys(this.net.peers)) {
          this.send(EMType.NewTerm, {
            term: this.term,
          }, peerIp);
          this.heartBeatCounter += 1;
        }

        break;
      case ENodeState.Candidate:
        this.state = ENodeState.Candidate;
        this.logger.role = ENodeState.Candidate;
        this.votesCounter = 1;

        this.send(EMType.NewState, {
          oldState: oldState,
          newState: this.state,
        }, EComponent.Logger);

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
    if (this.state == ENodeState.Leader) {
      this.requests[message.payload.token] = message.source;

      switch (message.payload.type) {
        case EOpType.KVOp: {
          this.store.kvop(message.payload);
          break;
        }
        default:
          this.send(EMType.InvalidClientRequestType, {
            invalidType: message.payload.type,
          }, EComponent.Logger);
          break;
      }
    } else {
      this.requests[message.payload.token] = message.source;

      this.send(message.type, message.payload, this.leader);

      this.send(EMType.ClientRequestForward, {
        message: message,
      }, EComponent.Logger);
    }
  };

  [EMType.HeartBeat]: H<EMType.HeartBeat> = (message) => {
    if (
      this.state === ENodeState.Candidate ||
      this.state === ENodeState.Starting
    ) {
      // Check performance here (called very often)
      this.transitionFunction(ENodeState.Follower);
      return;
    }

    this.leader = message.source;
    this.heartBeatCounter += 1;

    clearTimeout(this.electionTimeoutId);

    this.electionTimeoutId = setTimeout(() => {
      this.transitionFunction(ENodeState.Candidate);
    }, this.electionTimeout);

    this.store.sync(message.payload.wal)
      .then((report) => {

        // Appended logs are notified to the leader
        for (const entry of report.appended) {
          this.send(EMType.KVOpAccepted, entry, message.source);
        }

        return report;
      }).then((report) => {
        if (report.appended.length + report.commited.length) {
          this.send(EMType.StoreSyncComplete, {
            report: report,
          }, EComponent.Logger);
        }
      });
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    const log: ILog = message.payload.log;
    const votes: number = this.store.voteFor(log.next.key);

    if (votes === -1) { // Key is not currently under vote
      this.send(
        EMType.KVOpAcceptedReceivedButCommited,
        message.payload,
        EComponent.Logger,
      );
    } else if (votes >= this.net.quorum) {
      this.store.commit({
        log: log,
        token: message.payload.token,
      }).then((entry) => {
        this.send(EMType.KVOpRequestComplete, message.payload, EComponent.Node);
      });
    } else {
      this.send(EMType.KVOpAcceptedReceived, {
        message: message,
        qorum: this.net.quorum,
        votes: votes,
        token: message.payload.token,
      }, EComponent.Logger);
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

      if (
        this.votesCounter >= this.net.quorum
      ) {
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

    if (message.payload.wal) {
      this.store.sync(message.payload.wal);
    }

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

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionClose> = (message) => {
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = (message) => {
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (
    message,
  ) => {
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.PeerServerStarted]: H<EMType.PeerServerStarted> = (message) => {
    if (this.net.ready && this.discovery.ready) {
      this.discovery.discover();
    }
  }

  [EMType.DiscoveryServerStarted]: H<EMType.DiscoveryServerStarted> = (message) => {
    if (this.net.ready && this.discovery.ready) {
      this.discovery.discover();
    }
  }

  [EMType.DiscoveryResult]: H<EMType.DiscoveryResult> = (message) => {
    // If node is leader or knows a leader, break
    if (this.state === ENodeState.Leader || this.leader.length) {
      this.send(EMType.DiscoveredResultIgnored, {
        result: message.payload,
        state: this.state,
        leader: this.leader,
      }, EComponent.Logger)
      return;
    }

    // If discovery found a node, connect to it
    if (message.payload.success) {
      this.send(EMType.PeerConnectionRequest, {
        peerIp: message.payload.result,
      }, EComponent.Net)
    }

    // either way, discovery is finished so node is ready
    this.send(EMType.NodeReady, {
      ready: true,
    }, EComponent.NetWorker)

    // discovery finishes by passing follower (may move to leader if no node found)
    this.transitionFunction(ENodeState.Follower);
  }

  [EMType.ClientResponse]: H<EMType.ClientResponse> = (message) => {
    this.send(message.type, message.payload, this.requests[message.payload.token]);
    delete this.requests[message.payload.token];
  }
}
