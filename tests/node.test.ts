import { state } from "../src/state.ts";
import Node from "../src/node.ts";
import {
  EComponent,
  EKVOpType,
  EMType,
  ENodeState,
  EOpType,
} from "../src/enumeration.ts";
import { assertMessages } from "./helpers.ts";
import { IMessage, IState } from "../src/interfaces/interface.ts";
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

Deno.test("Node::NewState::Follower", async () => {
  const s: IState = {
    ...state,
    net: {
      ...state.net,
      peers: {},
    },
    electionTimeout: 50,
  };

  const component = new Node(s);

  const message: IMessage<EMType.NewState> = {
    type: EMType.NewState,
    destination: EComponent.Node,
    payload: {
      from: s.role,
      to: ENodeState.Follower,
      reason: "For testing",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewState,
      payload: {
        from: ENodeState.Follower,
        to: ENodeState.Candidate,
        reason: `electionTimeout completed (${s.electionTimeout}ms)`,
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::NewState::Leader", async () => {
  const s: IState = {
    ...state,
    heartBeatInterval: 10,
    term: 1,
    net: {
      ...state.net,
      peers: {
        "127.0.0.1": {
          peerIp: "127.0.0.1",
        },
      },
    },
  };

  const component = new Node(s);

  const message: IMessage<EMType.NewState> = {
    type: EMType.NewState,
    destination: EComponent.Node,
    payload: {
      from: s.role,
      to: ENodeState.Leader,
      reason: "For testing",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewTerm,
      payload: {
        term: 2,
      },
      source: EComponent.Node,
      destination: "127.0.0.1",
    },
  ], message);

  assertEquals(typeof s.heartBeatIntervalId === "number", true);
  assertEquals(s.term, 2);
  assertEquals(s.role, ENodeState.Leader);
  assertEquals(s.leader, EComponent.Node);

  component.shutdown();
});

Deno.test("Node::NewTerm::Accept", async () => {
  const s: IState = {
    ...state,
    voteGrantedDuringTerm: true,
    heartBeatInterval: 10,
    term: 1,
  };

  const component = new Node(s);

  const message: IMessage<EMType.NewTerm> = {
    type: EMType.NewTerm,
    destination: EComponent.Node,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewTermAccepted,
      payload: {
        term: 2,
      },
      source: EComponent.Node,
      destination: EComponent.Logger,
    },
  ], message);

  assertEquals(s.term, 2);
  assertEquals(s.voteGrantedDuringTerm, false);

  component.shutdown();
});

Deno.test("Node::NewTerm::Reject", async () => {
  const s: IState = {
    ...state,
    heartBeatInterval: 10,
    term: 3,
  };

  const component = new Node(s);

  const message: IMessage<EMType.NewTerm> = {
    type: EMType.NewTerm,
    destination: EComponent.Node,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewTermRejected,
      payload: {
        term: s.term,
      },
      source: EComponent.Node,
      destination: message.source,
    },
  ], message);

  assertEquals(s.term, 3);
  assertEquals(s.voteGrantedDuringTerm, false);

  component.shutdown();
});

Deno.test("Node::NewTermRejected", async () => {
  const s: IState = {
    ...state,
    heartBeatInterval: 10,
    term: 3,
  };

  const component = new Node(s);

  const message: IMessage<EMType.NewTermRejected> = {
    type: EMType.NewTermRejected,
    destination: EComponent.Node,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `NewTermRejected from ${message.source}`
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    },
  ], message);

  assertEquals(s.term, 3);

  component.shutdown();
});

Deno.test("Node::CallForVoteRequest::Granted", async () => {
  const s: IState = {
    ...state,
    voteGrantedDuringTerm: false,
    role: ENodeState.Follower,
  };

  const component = new Node(s);

  const message: IMessage<EMType.CallForVoteRequest> = {
    type: EMType.CallForVoteRequest,
    destination: EComponent.Node,
    payload: {
      term: 2,
      peerIp: "127.0.0.1",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.CallForVoteResponse,
      payload: {
        voteGranted: true,
      },
      source: EComponent.Node,
      destination: message.source,
    },
  ], message);

  assertEquals(s.voteGrantedDuringTerm, true);

  component.shutdown();
});

Deno.test("Node::CallForVoteRequest::AlreadyVoted", async () => {
  const s: IState = {
    ...state,
    voteGrantedDuringTerm: true,
    role: ENodeState.Follower,
  };

  const component = new Node(s);

  const message: IMessage<EMType.CallForVoteRequest> = {
    type: EMType.CallForVoteRequest,
    destination: EComponent.Node,
    payload: {
      term: 2,
      peerIp: "127.0.0.1",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EComponent.Node,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::CallForVoteRequest::Leader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Leader,
  };

  const component = new Node(s);

  const message: IMessage<EMType.CallForVoteRequest> = {
    type: EMType.CallForVoteRequest,
    destination: EComponent.Node,
    payload: {
      term: 2,
      peerIp: "127.0.0.1",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EComponent.Node,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::CallForVoteRequest::OutdatedTerm", async () => {
  const s: IState = {
    ...state,
    term: 3,
    voteGrantedDuringTerm: false,
    role: ENodeState.Follower,
  };

  const component = new Node(s);

  const message: IMessage<EMType.CallForVoteRequest> = {
    type: EMType.CallForVoteRequest,
    destination: EComponent.Node,
    payload: {
      term: 2,
      peerIp: "127.0.0.1",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EComponent.Node,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::KVOpRejected::Leader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Leader,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    type: EOpType.KVOp,
    timestamp: 12345678,
    payload: {
      op: EKVOpType.Get,
      kv: {
        key: "key",
      },
    },
  };

  const message: IMessage<EMType.KVOpRejected> = {
    type: EMType.KVOpRejected,
    destination: EComponent.Node,
    payload: {
      reason: "Just because",
      request: request,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.ClientResponse,
      payload: request,
      source: EComponent.Node,
      destination: EComponent.Node,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::KVOpRejected::NotLeader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Candidate,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    type: EOpType.KVOp,
    timestamp: 12345678,
    payload: {
      op: EKVOpType.Get,
      kv: {
        key: "key",
      },
    },
  };

  const message: IMessage<EMType.KVOpRejected> = {
    type: EMType.KVOpRejected,
    destination: EComponent.Node,
    payload: {
      reason: "Just because",
      request: request,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: "Unexpected KVOpRejected with role " + s.role,
      },
      source: EComponent.Node,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::ClientRequestForward", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Candidate,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    type: EOpType.KVOp,
    timestamp: 12345678,
    payload: {
      op: EKVOpType.Get,
      kv: {
        key: "key",
      },
    },
  };

  const message: IMessage<EMType.ClientRequestForward> = {
    type: EMType.ClientRequestForward,
    destination: EComponent.Node,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.ClientRequest,
      payload: request,
      source: message.source,
      destination: EComponent.Api,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::ClientResponse", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Candidate,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    type: EOpType.KVOp,
    timestamp: 12345678,
    payload: {
      op: EKVOpType.Get,
      kv: {
        key: "key",
      },
    },
  };

  const message: IMessage<EMType.ClientResponse> = {
    type: EMType.ClientResponse,
    destination: EComponent.Node,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.ClientResponse,
      payload: request,
      source: EComponent.Node,
      destination: EComponent.Api,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::StoreLogCommitSuccess::Follower", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Follower,
  };

  const component = new Node(s);

  const message: IMessage<EMType.StoreLogCommitSuccess> = {
    type: EMType.StoreLogCommitSuccess,
    destination: EComponent.Node,
    payload: [
      {
        token: "token",
        log: {
          op: EKVOpType.Get,
          timestamp: 1235,
          commited: true,
          next: {
            key: "key"
          }
        },
      }
    ],
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.KVOpRequestComplete,
      payload: {
        token: "token",
        log: {
          op: EKVOpType.Get,
          timestamp: 1235,
          commited: true,
          next: {
            key: "key"
          }
        },
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    }
  ], message);

  component.shutdown();
});

Deno.test("Node::StoreLogCommitSuccess::Leader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Leader,
    net: {
      ...state.net,
      peers: {
        "127.0.0.1": {
          peerIp: "127.0.0.1"
        }
      }
    }
  };

  const component = new Node(s);

  const message: IMessage<EMType.StoreLogCommitSuccess> = {
    type: EMType.StoreLogCommitSuccess,
    destination: EComponent.Node,
    payload: [
      {
        token: "token",
        log: {
          op: EKVOpType.Get,
          timestamp: 1235,
          commited: true,
          next: {
            key: "key"
          }
        },
      }
    ],
    source: "Source",
  };

  const payload = {
    token: "token",
    log: {
      op: EKVOpType.Get,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key"
      }
    },
  }

  await assertMessages([
    {
      type: EMType.KVOpRequestComplete,
      payload: payload,
      source: EComponent.Node,
      destination: EComponent.Node,
    },
    {
      type: EMType.AppendEntry,
      payload: payload,
      source: EComponent.Node,
      destination: "127.0.0.1",
    }
  ], message);

  component.shutdown();
});

Deno.test("Node::KVOpRequestComplete::Leader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Leader,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    log: {
      op: EKVOpType.Get,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key"
      }
    },
  };

  const message: IMessage<EMType.KVOpRequestComplete> = {
    type: EMType.KVOpRequestComplete,
    destination: EComponent.Node,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.ClientResponse,
      payload: {
        token: message.payload.token,
        type: EOpType.KVOp,
        payload: {
          kv: message.payload.log.next,
          op: message.payload.log.op,
        },
        timestamp: message.payload.log.timestamp,
      },
      source: EComponent.Node,
      destination: EComponent.Api,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::KVOpRequestComplete::NotLeader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Candidate,
  };

  const component = new Node(s);

  const request = {
    token: "token",
    log: {
      op: EKVOpType.Get,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key"
      }
    },
  };

  const message: IMessage<EMType.KVOpRequestComplete> = {
    type: EMType.KVOpRequestComplete,
    destination: EComponent.Node,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: "Unexpected KVOpRequestComplete with role " + s.role
      },
      source: EComponent.Node,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::HeartBeat::Leader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Leader,
  };

  const component = new Node(s);

  const message: IMessage<EMType.HeartBeat> = {
    type: EMType.HeartBeat,
    destination: EComponent.Node,
    payload: null,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: "Unexpected HeartBeat with role " + s.role
      },
      source: EComponent.Node,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("Node::HeartBeat::NotLeader", async () => {
  const s: IState = {
    ...state,
    role: ENodeState.Candidate,
  };

  const component = new Node(s);

  const message: IMessage<EMType.HeartBeat> = {
    type: EMType.HeartBeat,
    destination: EComponent.Node,
    payload: null,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `Received HeartBeat from ${message.source}`
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    },
  ], message);

  assertEquals(s.leader, message.source);

  component.shutdown();
});

Deno.test("Node::AppendEntry::Commited", async () => {
  const s: IState = {
    ...state
  };

  const component = new Node(s);

  const message: IMessage<EMType.AppendEntry> = {
    type: EMType.AppendEntry,
    destination: EComponent.Node,
    payload: {
      token: "token",
      log: {
        op: EKVOpType.Get,
        timestamp: 1235,
        commited: true,
        next: {
          key: "key"
        }
      },
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `Received AppendEntry from ${message.source}`
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    },
    {
      type: EMType.StoreLogCommitRequest,
      payload: message.payload,
      source: EComponent.Node,
      destination: EComponent.Store,
    }
  ], message);

  component.shutdown();
});

Deno.test("Node::AppendEntry::NotCommited", async () => {
  const s: IState = {
    ...state
  };

  const component = new Node(s);

  const message: IMessage<EMType.AppendEntry> = {
    type: EMType.AppendEntry,
    destination: EComponent.Node,
    payload: {
      token: "token",
      log: {
        op: EKVOpType.Get,
        timestamp: 1235,
        commited: false,
        next: {
          key: "key"
        }
      },
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `Received AppendEntry from ${message.source}`
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    }
  ], message);

  component.shutdown();
});

Deno.test("Node::DiscoveryResult::Success", async () => {
  const s: IState = {
    ...state
  };

  const component = new Node(s);

  const message: IMessage<EMType.DiscoveryResult> = {
    type: EMType.DiscoveryResult,
    destination: EComponent.Node,
    payload: {
      success: true,
      result: "127.0.0.1",
      source: "http"
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.PeerConnectionRequest,
      payload: {
        peerIp: "127.0.0.1"
      },
      source: EComponent.Node,
      destination: EComponent.Net,
    }
  ], message);

  component.shutdown();
});

Deno.test("Node::DiscoveryResult::NotSuccess", async () => {
  const s: IState = {
    ...state
  };

  const component = new Node(s);

  const message: IMessage<EMType.DiscoveryResult> = {
    type: EMType.DiscoveryResult,
    destination: EComponent.Node,
    payload: {
      success: false,
      result: "127.0.0.1",
      source: "http"
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: "Node is ready after discovery result"
      },
      source: EComponent.Node,
      destination: EComponent.Logger,
    },
    {
      type: EMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `Got DiscoveryResult`
      },
      source: EComponent.Node,
      destination: EComponent.Node,
    }
  ], message);

  assertEquals(s.ready, true);

  component.shutdown();
});

/**
 * MISSING
 * 
 * M - PeerConnectionOpen
 * L - PeerConnectionAccepted
 * L - CallForVoteResponse
 * L - KVOpAccepted
 */