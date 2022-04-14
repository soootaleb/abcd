import { EComponent } from "ddapps/enumeration.ts";
import { M } from "ddapps/type.ts";
import { Api } from "ddapps/api.ts";
import { Peer } from "ddapps/peer.ts";
import { EMType } from "ddapps/messages.ts";
import { EKVComponent, ENodeState } from "./enumeration.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import { KVM } from "./type.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";
import { IKVState, ILog } from "./interface.ts";
import { Store } from "./store.ts";
import { DRemotePeer } from "ddapps/models/remotepeer.model.ts";

export  class KVPeer extends Peer<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
> {
  public shutdown() {
    super.shutdown();
    clearTimeout(this.state.electionTimeoutId);
    clearInterval(this.state.heartBeatIntervalId);
  }

  protected [EMType.PeerConnectionOpen](message: M<EMType.PeerConnectionOpen>) {
    // Duplicate known peers before adding the new one (it already knows itself...)
    const knownPeers = this.peers.ips.filter((peer) => !message.payload.hostname.startsWith(peer)); // because peer connections are in parallel

    this.send(EMType.PeerConnectionAccepted, {
      term: this.state.term,
      knownPeers: knownPeers,
      wal: this.state.role === ENodeState.Leader ? this.state.store.wal : [],
    }, message.payload.hostname);
  }

  protected [EKVMType.NewState](message: KVM<EKVMType.NewState>) {
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
          this.send(EKVMType.NewState, {
            from: this.state.role,
            to: ENodeState.Candidate,
            reason: `KVPeer::NewState::Reason::ElectionTimeoutCompleted::${this.state.electionTimeout}ms`,
          }, KVPeer);
        }, this.state.electionTimeout);
        break;
      case ENodeState.Leader:
        this.state.heartBeatIntervalId = setInterval(() => {
          this.peers.send(EKVMType.HeartBeat, null)
        }, this.state.heartBeatInterval);

        this.state.term += 1;
        this.state.role = ENodeState.Leader;
        this.state.leader = EKVComponent.KVPeer;

        this.peers.send(EKVMType.NewTerm, {
          term: this.state.term,
        });

        break;
      case ENodeState.Candidate:
        this.state.role = ENodeState.Candidate;
        this.state.votesCounter = 1;

        if (this.peers.ips.length == 0) {
          this.send(EKVMType.NewState, {
            from: this.state.role,
            to: ENodeState.Leader,
            reason: `KVPeer::NewState::Reason::NoPeers`,
          }, KVPeer);
        } else {
          this.peers.send(EKVMType.CallForVoteRequest, {
            term: this.state.term
          });
          this.state.electionTimeoutId = setTimeout(() => {
            this.send(EKVMType.NewState, {
              from: this.state.role,
              to: ENodeState.Candidate,
              reason: `KVPeer::NewState::Reason::ElectionTimeoutReset`
            }, KVPeer);
          }, this.state.electionTimeout);
        }

        break;
      default:
        this.send(EKVMType.InvalidTransitionToState, {
          currentState: this.state.role,
          transitionTo: message.payload.to,
        }, EComponent.Logger);
    }
  }

  protected [EKVMType.HeartBeat](message: KVM<EKVMType.HeartBeat>) {
    if (
      this.state.role === ENodeState.Candidate ||
      this.state.role === ENodeState.Starting ||
      this.state.role === ENodeState.Follower
    ) {
      this.state.leader = message.source;
      this.send(EKVMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::ReceivedHeartBeatFrom::${message.source}`,
      }, KVPeer);
      return;
    } else {
      this.send(EMType.LogMessage, {
        message: `KVPeer::HeartBeat::UnexpectedWithRole::${this.state.role}`,
      }, EComponent.Logger);
    }
  }

  /**
   * [TODO] Before accepting, the follower should
   * - Verify the term (split brain)
   * - Verify the entry is the latest (timestamp)
   * - ... check RAFT paper
   * @param message
   */
  protected [EKVMType.AppendEntry](message: KVM<EKVMType.AppendEntry>) {
    this.send(EKVMType.NewState, {
      from: this.state.role,
      to: ENodeState.Follower,
      reason: `KVPeer::NewState::Reason::ReceivedAppendEntryFrom::${message.source}`,
    }, KVPeer);
    if (message.payload.log.commited) {
      this.send(
        EKVMType.StoreLogCommitRequest,
        message.payload,
        Store,
      );
    } else { // TODO else if log term is current term
      this.send(EKVMType.KVOpAccepted, message.payload, message.source);
    }
  }

  protected [EKVMType.KVOpAccepted](message: KVM<EKVMType.KVOpAccepted>) {
    const log: ILog = message.payload.log;

    // [TODO] Find a cleaner logic
    if (message.source === EKVComponent.Store) {
      this.peers.send(EKVMType.AppendEntry, {
        log: log,
        token: message.payload.token,
      });
    }

    const quorum =
      Math.floor((Object.keys(this.state.net.peers).length + 1) / 2) + 1;

    if (Object.keys(this.state.store.votes).includes(log.next.key)) {
      // Votes for
      this.state.store.votes[log.next.key] += 1;

      if (this.state.store.votes[log.next.key] >= quorum) {
        delete this.state.store.votes[log.next.key];
        this.send(EKVMType.StoreLogCommitRequest, {
          log: log,
          token: message.payload.token,
        }, Store);
      }
    } else {
      this.send(
        EKVMType.KVOpAcceptedReceivedButCommited,
        message.payload,
        EComponent.Logger,
      );
    }
  }

  protected [EKVMType.KVOpRequestComplete](
    message: KVM<EKVMType.KVOpRequestComplete>,
  ) {
    if (this.state.role === ENodeState.Leader) {
      this.send(EMType.ClientResponse, {
        token: message.payload.token,
        type: message.payload.log.op,
        payload: {
          kv: message.payload.log.next,
          op: message.payload.log.op,
        },
        timestamp: message.payload.log.timestamp,
      }, EComponent.Api);
    } else {
      this.send(EMType.LogMessage, {
        message: `KVPeer::KVOpRequestComplete::UnexpectedWithRole::${this.state.role}`,
      }, EComponent.Logger);
    }
  }

  protected [EKVMType.NewTerm](message: KVM<EKVMType.NewTerm>) {
    if (message.payload.term > this.state.term) {
      this.state.term = message.payload.term;
      this.state.voteGrantedDuringTerm = false;

      this.send(EKVMType.NewTermAccepted, {
        term: this.state.term,
        leader: this.peers.get(message.source) as DRemotePeer<IKVRequestPayload, IKVResponsePayload, IKVMPayload>,
      }, EComponent.Logger);

      // TODO Implement WAL sync here
      this.send(EKVMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::ReceivedNewTermFrom::${message.source}`,
      }, KVPeer);
    } else {
      this.send(EKVMType.NewTermRejected, {
        term: this.state.term,
      }, message.source);
    }
  }

  protected [EKVMType.NewTermRejected](message: KVM<EKVMType.NewTermRejected>) {
    this.send(EKVMType.NewState, {
      from: this.state.role,
      to: ENodeState.Follower,
      reason: `KVPeer::NewState::Reason::NewTermRejectedFrom::${message.source}`,
    }, KVPeer);
  }

  protected [EKVMType.CallForVoteRequest](
    message: KVM<EKVMType.CallForVoteRequest>,
  ) {
    if (this.state.role === ENodeState.Leader) {
      this.send(EKVMType.CallForVoteResponse, {
        voteGranted: false,
      }, message.source);
    } else {
      this.send(EKVMType.CallForVoteResponse, {
        voteGranted: message.payload.term >= this.state.term &&
          !this.state.voteGrantedDuringTerm,
      }, message.source);

      this.state.voteGrantedDuringTerm = true;

      if (this.state.role != ENodeState.Starting) {
        this.send(EKVMType.NewState, {
          from: this.state.role,
          to: ENodeState.Follower,
          reason: `KVPeer::NewState::Reason::ReceivedCallForVoteRequestFrom::${message.source}`,
        }, KVPeer);
      }
    }
  }

  protected [EKVMType.CallForVoteResponse](
    message: KVM<EKVMType.CallForVoteResponse>,
  ) {
    if (this.state.role == ENodeState.Candidate) {
      if (message.payload.voteGranted) {
        this.state.votesCounter += 1;
      }

      const quorum =
        Math.floor((Object.keys(this.state.net.peers).length + 1) / 2) + 1;

      if (this.state.votesCounter >= quorum) {
        this.state.votesCounter = 0;
        this.send(EKVMType.NewState, {
          from: this.state.role,
          to: ENodeState.Leader,
          reason: `KVPeer::NewState::Reason::ReceivedCallForVoteResponseFrom::${message.source}`,
        }, KVPeer);
      }
    } else {
      this.send(EKVMType.VoteReceivedButNotCandidate, {
        callForVoteReply: message,
        currentState: this.state.role,
      }, EComponent.Logger);
    }
  }

  protected [EMType.DiscoveryResult](message: M<EMType.DiscoveryResult>) {
    super.DiscoveryResult(message);

    if (!message.payload.success) {
      this.send(EKVMType.NewState, {
        from: this.state.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::DiscoveryResult::${message.payload.success}::${message.payload.source}`,
      }, KVPeer)
    }
  }

  protected [EKVMType.KVOpRejected](message: KVM<EKVMType.KVOpRejected>) {
    if (this.state.role === ENodeState.Leader) {
      this.send(
        EMType.ClientResponse,
        {
          token: message.payload.request.token,
          timestamp: Date.now(),
          type: EKVOpType.KVReject,
          payload: message.payload.request,
        },
        Api,
      );
    } else {
      this.send(EMType.LogMessage, {
        message: `KVPeer::KVOpRejected::UnexpectedWithRole::${this.state.role}`,
      }, EComponent.Logger);
    }
  }

  protected [EKVMType.StoreLogCommitSuccess](
    message: KVM<EKVMType.StoreLogCommitSuccess>,
  ) {
    for (const entry of message.payload) {
      if (this.state.role === ENodeState.Leader) {
        this.send(EKVMType.KVOpRequestComplete, entry, KVPeer);
        this.peers.send(EKVMType.AppendEntry, entry);
      }
    }
  }
}
