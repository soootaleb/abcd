import type { ILog } from "./interfaces/interface.ts";
import { EComponent, EMType, ENodeState, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Peer extends Messenger {

  public shutdown() {
    super.shutdown();
    clearTimeout(this.state.electionTimeoutId);
    clearInterval(this.state.heartBeatIntervalId);
  }

  [EMType.NewState]: H<EMType.NewState> = (message) => {
    clearTimeout(this.state.electionTimeoutId);
    delete this.state.electionTimeoutId;
    
    clearInterval(this.state.heartBeatIntervalId);
    delete this.state.heartBeatIntervalId;

    this.state.store.votes = {};

    switch (message.payload.to) {
      case ENodeState.Starting:
        break;
      case ENodeState.Follower:
        this.state.role = ENodeState.Follower;

        this.state.electionTimeoutId = setTimeout(() => {
          this.send(EMType.NewState, {
            from: this.state.role,
            to: ENodeState.Candidate,
            reason:
              `electionTimeout completed (${this.state.electionTimeout}ms)`,
          }, EComponent.Node);
        }, this.state.electionTimeout);
        break;
      case ENodeState.Leader:
        this.state.heartBeatIntervalId = setInterval(() => {
          for (const peerIp of Object.keys(this.state.net.peers)) {
            this.send(EMType.HeartBeat, null, peerIp);
          }
        }, this.state.heartBeatInterval);

        this.state.term += 1;
        this.state.role = ENodeState.Leader;
        this.state.leader = EComponent.Node;

        for (const peerIp of Object.keys(this.state.net.peers)) {
          this.send(EMType.NewTerm, {
            term: this.state.term,
          }, peerIp);
        }

        break;
      case ENodeState.Candidate:
        this.state.role = ENodeState.Candidate;
        this.state.votesCounter = 1;

        if (Object.keys(this.state.net.peers).length == 0) {
          this.send(EMType.NewState, {
            from: this.state.role,
            to: ENodeState.Leader,
            reason: "Became candidate with no peers",
          }, EComponent.Node);
        } else {
          for (const peerIp of Object.keys(this.state.net.peers)) {
            this.send(EMType.CallForVoteRequest, {
              term: this.state.term,
              peerIp: peerIp,
            }, peerIp);
          }
          this.state.electionTimeoutId = setTimeout(() => {
            this.send(EMType.NewState, {
              from: this.state.role,
              to: ENodeState.Candidate,
              reason: "Restart electionTimeout as Candidate",
            }, EComponent.Node);
          }, this.state.electionTimeout);
        }

        break;
      default:
        this.send(EMType.InvalidTransitionToState, {
          currentState: this.state.role,
          transitionTo: message.payload.to,
        }, EComponent.Logger);
    }
  };

  [EMType.HeartBeat]: H<EMType.HeartBeat> = (message) => {
    if (
      this.state.role === ENodeState.Candidate ||
      this.state.role === ENodeState.Starting ||
      this.state.role === ENodeState.Follower
    ) {
      this.state.leader = message.source;
      this.send(EMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `Received HeartBeat from ${message.source}`,
      }, EComponent.Node);
      return;
    } else {
      this.send(EMType.LogMessage, {
        message: "Unexpected HeartBeat with role " + this.state.role
      }, EComponent.Logger)
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
    this.send(EMType.NewState, {
      from: this.state.role,
      to: ENodeState.Follower,
      reason: `Received AppendEntry from ${message.source}`,
    }, EComponent.Node);
    if (message.payload.log.commited) {
      this.send(
        EMType.StoreLogCommitRequest,
        message.payload,
        EComponent.Store,
      );
    } else { // TODO else if log term is current term
      this.send(EMType.KVOpAccepted, message.payload, message.source);
    }
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    const log: ILog = message.payload.log;

    // [TODO] Find a cleaner logic
    if (message.source === EComponent.Store) {
      for (const peer of Object.keys(this.state.net.peers)) {
        this.send(EMType.AppendEntry, {
          log: log,
          token: message.payload.token,
        }, peer);
      }
    }

    const quorum =
      Math.floor((Object.keys(this.state.net.peers).length + 1) / 2) + 1;

    if (Object.keys(this.state.store.votes).includes(log.next.key)) {
      // Votes for
      this.state.store.votes[log.next.key] += 1;

      if (this.state.store.votes[log.next.key] >= quorum) {
        delete this.state.store.votes[log.next.key];
        this.send(EMType.StoreLogCommitRequest, {
          log: log,
          token: message.payload.token,
        }, EComponent.Store);
      }
    } else {
      this.send(
        EMType.KVOpAcceptedReceivedButCommited,
        message.payload,
        EComponent.Logger,
      );
    }
  };

  [EMType.KVOpRequestComplete]: H<EMType.KVOpRequestComplete> = (message) => {
    if (this.state.role === ENodeState.Leader) {
      this.send(EMType.ClientResponse, {
        token: message.payload.token,
        type: EOpType.KVOp,
        payload: {
          kv: message.payload.log.next,
          op: message.payload.log.op,
        },
        timestamp: message.payload.log.timestamp,
      }, EComponent.Api);
    } else {
      this.send(EMType.LogMessage, {
        message: "Unexpected KVOpRequestComplete with role " + this.state.role
      }, EComponent.Logger);
    }
  };

  [EMType.NewTerm]: H<EMType.NewTerm> = (message) => {
    if (message.payload.term > this.state.term) {
      this.state.term = message.payload.term;
      this.state.voteGrantedDuringTerm = false;

      this.send(EMType.NewTermAccepted, {
        term: this.state.term,
        leader: this.state.net.peers[message.source],
      }, EComponent.Logger);

      // TODO Implement WAL sync here
      this.send(EMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `Received NewTerm from ${message.source}`,
      }, EComponent.Node);
    } else {
      this.send(EMType.NewTermRejected, {
        term: this.state.term,
      }, message.source);
    }
  };

  [EMType.NewTermRejected]: H<EMType.NewTermRejected> = (message) => {
    this.send(EMType.NewState, {
      from: this.state.role,
      to: ENodeState.Follower,
      reason: `NewTermRejected from ${message.source}`,
    }, EComponent.Node);
  };

  [EMType.CallForVoteRequest]: H<EMType.CallForVoteRequest> = (message) => {
    if (this.state.role === ENodeState.Leader) {
      this.send(EMType.CallForVoteResponse, {
        voteGranted: false,
      }, message.source);
    } else {
      this.send(EMType.CallForVoteResponse, {
        voteGranted: message.payload.term >= this.state.term &&
          !this.state.voteGrantedDuringTerm,
      }, message.source);

      this.state.voteGrantedDuringTerm = true;

      if (this.state.role != ENodeState.Starting) {
        this.send(EMType.NewState, {
          from: this.state.role,
          to: ENodeState.Follower,
          reason: `Received CallForVoteRequest from ${message.source}`,
        }, EComponent.Node);
      }
    }
  };

  [EMType.CallForVoteResponse]: H<EMType.CallForVoteResponse> = (message) => {
    if (this.state.role == ENodeState.Candidate) {
      if (message.payload.voteGranted) {
        this.state.votesCounter += 1;
      }

      const quorum =
        Math.floor((Object.keys(this.state.net.peers).length + 1) / 2) + 1;

      if (this.state.votesCounter >= quorum) {
        this.state.votesCounter = 0;
        this.send(EMType.NewState, {
          from: this.state.role,
          to: ENodeState.Leader,
          reason: `Received CallForVoteResponse from ${message.source}`,
        }, EComponent.Node);
      }
    } else {
      this.send(EMType.VoteReceivedButNotCandidate, {
        callForVoteReply: message,
        currentState: this.state.role,
      }, EComponent.Logger);
    }
  };

  [EMType.PeerConnectionAccepted]: H<EMType.PeerConnectionAccepted> = (
    message,
  ) => {
    this.state.term = message.payload.term;

    this.send(EMType.StoreSyncRequest, message.payload.wal, EComponent.Store);

    this.send(EMType.PeerConnectionComplete, {
      peerIp: message.source,
    }, EComponent.Logger);

    const unknownPeers = message.payload.knownPeers
      .filter((peer) => {
        return !Object.keys(this.state.net.peers)
          .map((peer) => peer.split("-")[0])
          .includes(peer);
      });

    // If some peers are uknown and left to be connected to, do it
    if (unknownPeers.length) {
      for (const peerIp of unknownPeers) {
        this.send(EMType.PeerConnectionRequest, {
          peerIp: peerIp,
        }, EComponent.Net);
      }
    } else { // If all peers are known (all are connected), then go follower
      this.state.ready = true;

      this.send(EMType.LogMessage, {
        message: "Node is ready after peer connection accepted",
      }, EComponent.Logger);

      this.send(EMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `Connected to all peers`,
      }, EComponent.Node);
    }
  };

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    // Duplicate known peers before adding the new one (it already knows itself...)
    const knownPeers = Object.keys(this.state.net.peers)
      .map((peer) => peer.split("-")[0]) // return only IP & not conn identifier
      .filter((peer) => peer != message.payload.peerIp.split("-")[0]); // because peer connections are in parallel

    this.send(EMType.PeerConnectionAccepted, {
      term: this.state.term,
      knownPeers: knownPeers,
      wal: this.state.role === ENodeState.Leader ? this.state.store.wal : [],
    }, message.payload.peerIp);
  };

  [EMType.DiscoveryResult]: H<EMType.DiscoveryResult> = (message) => {

    if (message.payload.success) {
      this.send(EMType.PeerConnectionRequest, {
        peerIp: message.payload.result,
      }, EComponent.Net);
    } else {
      this.state.ready = true;

      this.send(EMType.LogMessage, {
        message: "Node is ready after discovery result",
      }, EComponent.Logger);

      this.send(EMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `Got DiscoveryResult`,
      }, EComponent.Node);
    }
  };

  [EMType.KVOpRejected]: H<EMType.KVOpRejected> = (message) => {
    if (this.state.role === ENodeState.Leader) {
      this.send(EMType.ClientResponse, message.payload.request, EComponent.Node);
    } else {
      this.send(EMType.LogMessage, {
        message: "Unexpected KVOpRejected with role " + this.state.role
      }, EComponent.Logger);
    }
  };

  /**
   * Node self sends ClientResponse &&
   * Can receive it from another node in case of ClientRequestForward
   * TODO: Implement a ClientResponseForward
   * @param message 
   */
  [EMType.ClientResponse]: H<EMType.ClientResponse> = (message) => {
    this.send(EMType.ClientResponse, message.payload, EComponent.Api);
  };

  [EMType.ClientRequestForward]: H<EMType.ClientRequestForward> = message => {
    this.send(EMType.ClientRequest, message.payload, EComponent.Api, message.source)
  }

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (message) => {
      for (const entry of message.payload) {
        this.send(EMType.KVOpRequestComplete, entry, EComponent.Node);
        if (this.state.role === ENodeState.Leader) {
          for (const peer of Object.keys(this.state.net.peers)) {
            this.send(EMType.AppendEntry, entry, peer);
          }
        }
      }
    };
}
