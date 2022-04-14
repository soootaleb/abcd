import { kvstate } from "../src/kv/kvstate.ts";
import { KVPeer } from "../src/kv/kvpeer.ts";
import { EComponent } from "ddapps/enumeration.ts";
import { assertEquals } from "std/testing/asserts.ts";
import { EMType } from "ddapps/messages.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "../src/kv/operation.ts";
import { EKVMType, IKVMPayload } from "../src/kv/messages.ts";
import { IKVState } from "../src/kv/interface.ts";
import { KVM } from "../src/kv/type.ts";
import { EKVComponent, ENodeState } from "../src/kv/enumeration.ts";
import { getAssert, getAwaitMessages } from "ddapps/testing.ts";
import { DRemotePeerSet } from "ddapps/models/remotepeerset.model.ts";
import { DRemotePeer } from "ddapps/models/remotepeer.model.ts";
import { Messenger } from "ddapps/messenger.ts";

const assertMessages = getAssert<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload
>();

const awaitMessages = getAwaitMessages<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload
>();

Deno.test("KVPeer::NewState::Follower", async () => {
  const s: IKVState = {
    ...kvstate,
    net: {
      ...kvstate.net,
      peers: new DRemotePeerSet(),
    },
    electionTimeout: 50,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.NewState> = {
    type: EKVMType.NewState,
    destination: EKVComponent.KVPeer,
    payload: {
      from: s.role,
      to: ENodeState.Follower,
      reason: `KVPeer::NewState::Reason::Testing`
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewState,
      payload: {
        from: ENodeState.Follower,
        to: ENodeState.Candidate,
        reason: `KVPeer::NewState::Reason::ElectionTimeoutCompleted::${s.electionTimeout}ms`
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::NewState::Leader", async () => {
  const peers = new DRemotePeerSet<
    IKVRequestPayload,
    IKVResponsePayload,
    IKVMPayload
  >();
  peers.set("127.0.0.1", new DRemotePeer("127.0.0.1"));
  const s: IKVState = {
    ...kvstate,
    heartBeatInterval: 10,
    term: 1,
    net: {
      ...kvstate.net,
      peers: peers,
    },
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.NewState> = {
    type: EKVMType.NewState,
    destination: EKVComponent.KVPeer,
    payload: {
      from: s.role,
      to: ENodeState.Leader,
      reason: "KVPeer::NewState::Reason::Testing",
    },
    source: "Source",
  };

  const messenger = new Messenger<
    IKVRequestPayload,
    IKVResponsePayload,
    IKVMPayload
  >(kvstate);

  await messenger.send(
    message.type,
    message.payload,
    message.destination,
    message.source,
  ).then(() => {
    assertEquals(
      typeof s.heartBeatIntervalId === "number",
      true,
      "KVPeer::NewState::Leader::HeartBeatIntervalNotSet",
    );
    assertEquals(s.term, 2, "KVPeer::NewState::Leader::IncorrectTerm");
    assertEquals(s.role, ENodeState.Leader, "KVPeer::NewState::IncorrectRole");
    assertEquals(s.leader, EKVComponent.KVPeer, "KVPeer::NewState::IncorrectLeader");

    component.shutdown();
    messenger.shutdown();
  });
});

Deno.test("KVPeer::NewTerm::Accept", async () => {
  const s: IKVState = {
    ...kvstate,
    voteGrantedDuringTerm: true,
    heartBeatInterval: 10,
    term: 1,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.NewTerm> = {
    type: EKVMType.NewTerm,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewTermAccepted,
      payload: {
        term: 2,
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Logger,
    },
  ], message);

  assertEquals(s.term, 2);
  assertEquals(s.voteGrantedDuringTerm, false);

  component.shutdown();
});

Deno.test("KVPeer::NewTerm::Reject", async () => {
  const s: IKVState = {
    ...kvstate,
    heartBeatInterval: 10,
    term: 3,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.NewTerm> = {
    type: EKVMType.NewTerm,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewTermRejected,
      payload: {
        term: s.term,
      },
      source: EKVComponent.KVPeer,
      destination: message.source,
    },
  ], message);

  assertEquals(s.term, 3);
  assertEquals(s.voteGrantedDuringTerm, false);

  component.shutdown();
});

Deno.test("KVPeer::NewTermRejected", async () => {
  const s: IKVState = {
    ...kvstate,
    heartBeatInterval: 10,
    term: 3,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.NewTermRejected> = {
    type: EKVMType.NewTermRejected,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::NewTermRejectedFrom::${message.source}`,
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
  ], message);

  assertEquals(s.term, 3);

  component.shutdown();
});

Deno.test("KVPeer::CallForVoteRequest::Granted", async () => {
  const s: IKVState = {
    ...kvstate,
    voteGrantedDuringTerm: false,
    role: ENodeState.Follower,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.CallForVoteRequest> = {
    type: EKVMType.CallForVoteRequest,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.CallForVoteResponse,
      payload: {
        voteGranted: true,
      },
      source: EKVComponent.KVPeer,
      destination: message.source,
    },
  ], message);

  assertEquals(s.voteGrantedDuringTerm, true);

  component.shutdown();
});

Deno.test("KVPeer::CallForVoteRequest::AlreadyVoted", async () => {
  const s: IKVState = {
    ...kvstate,
    voteGrantedDuringTerm: true,
    role: ENodeState.Follower,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.CallForVoteRequest> = {
    type: EKVMType.CallForVoteRequest,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EKVComponent.KVPeer,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::CallForVoteRequest::Leader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.CallForVoteRequest> = {
    type: EKVMType.CallForVoteRequest,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EKVComponent.KVPeer,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::CallForVoteRequest::OutdatedTerm", async () => {
  const s: IKVState = {
    ...kvstate,
    term: 3,
    voteGrantedDuringTerm: false,
    role: ENodeState.Follower,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.CallForVoteRequest> = {
    type: EKVMType.CallForVoteRequest,
    destination: EKVComponent.KVPeer,
    payload: {
      term: 2,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.CallForVoteResponse,
      payload: {
        voteGranted: false,
      },
      source: EKVComponent.KVPeer,
      destination: message.source,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::KVOpRejected::Leader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
  };

  const component = new KVPeer(s);

  const request = {
    token: "token",
    trace: false,
    type: EKVOpType.KVGet,
    timestamp: 12345678,
    payload: "key",
  };

  const message: KVM<EKVMType.KVOpRejected> = {
    type: EKVMType.KVOpRejected,
    destination: EKVComponent.KVPeer,
    payload: {
      reason: `KVPeer::KVOpRejected::Reason::Testing`,
      request: request,
    },
    source: "Source",
  };

  const messages = await awaitMessages([EComponent.Api], message);
  const response = messages[0] as KVM<EMType.ClientResponse>;

  // Need to check the payload
  assertEquals(EMType.ClientResponse, response.type);
  assertEquals(request.token, response.payload.token);
  assertEquals(EKVOpType.KVReject, response.payload.type);
  assertEquals(EKVComponent.KVPeer, response.source);
  assertEquals(EComponent.Api, response.destination);

  component.shutdown();
});

Deno.test("KVPeer::KVOpRejected::NotLeader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Candidate,
  };

  const component = new KVPeer(s);

  const request = {
    token: "token",
    trace: false,
    type: EKVOpType.KVGet,
    timestamp: 12345678,
    payload: "key",
  };

  const message: KVM<EKVMType.KVOpRejected> = {
    type: EKVMType.KVOpRejected,
    destination: EKVComponent.KVPeer,
    payload: {
      reason: `KVPeer::KVOpRejected::Reason::Testing`,
      request: request,
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: `KVPeer::KVOpRejected::UnexpectedWithRole::${s.role}`
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::StoreLogCommitSuccess::Follower", async () => {
  const s: IKVState = {
    ...kvstate,
    electionTimeout: 1000,
    role: ENodeState.Follower,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.StoreLogCommitSuccess> = {
    type: EKVMType.StoreLogCommitSuccess,
    destination: EKVComponent.KVPeer,
    payload: [
      {
        token: "token",
        log: {
          op: EKVOpType.KVGet,
          timestamp: 1235,
          commited: true,
          next: {
            key: "key",
          },
        },
      },
    ],
    source: "Source",
  };

  const messenger = new Messenger<
    IKVRequestPayload,
    IKVResponsePayload,
    IKVMPayload
  >(kvstate);

  await messenger.send(
    message.type,
    message.payload,
    message.destination,
    message.source,
  ).then(() => {
    component.shutdown();
  })

});

Deno.test("KVPeer::StoreLogCommitSuccess::Leader", async () => {
  const peers = new DRemotePeerSet<IKVRequestPayload, IKVResponsePayload, IKVMPayload>();
  peers.set("127.0.0.1", new DRemotePeer("127.0.0.1"))
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
    net: {
      ...kvstate.net,
      peers: peers,
    },
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.StoreLogCommitSuccess> = {
    type: EKVMType.StoreLogCommitSuccess,
    destination: EKVComponent.KVPeer,
    payload: [
      {
        token: "token",
        log: {
          op: EKVOpType.KVGet,
          timestamp: 1235,
          commited: true,
          next: {
            key: "key",
          },
        },
      },
    ],
    source: "Source",
  };

  const payload = {
    token: "token",
    log: {
      op: EKVOpType.KVGet,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key",
      },
    },
  };

  await assertMessages([
    {
      type: EKVMType.KVOpRequestComplete,
      payload: payload,
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    }
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::KVOpRequestComplete::Leader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
  };

  const component = new KVPeer(s);

  const request = {
    token: "token",
    log: {
      op: EKVOpType.KVGet,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key",
      },
    },
  };

  const message: KVM<EKVMType.KVOpRequestComplete> = {
    type: EKVMType.KVOpRequestComplete,
    destination: EKVComponent.KVPeer,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.ClientResponse,
      payload: {
        token: message.payload.token,
        type: EKVOpType.KVGet,
        payload: {
          kv: message.payload.log.next,
          op: message.payload.log.op,
        },
        timestamp: message.payload.log.timestamp,
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Api,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::KVOpRequestComplete::NotLeader", async () => {
  const s: IKVState = {
    ...kvstate,
    electionTimeout: 1000,
    role: ENodeState.Candidate,
  };

  const component = new KVPeer(s);

  const request = {
    token: "token",
    log: {
      op: EKVOpType.KVGet,
      timestamp: 1235,
      commited: true,
      next: {
        key: "key",
      },
    },
  };

  const message: KVM<EKVMType.KVOpRequestComplete> = {
    type: EKVMType.KVOpRequestComplete,
    destination: EKVComponent.KVPeer,
    payload: request,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: `KVPeer::KVOpRequestComplete::UnexpectedWithRole::${s.role}`,
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::HeartBeat::Leader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.HeartBeat> = {
    type: EKVMType.HeartBeat,
    destination: EKVComponent.KVPeer,
    payload: null,
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: `KVPeer::HeartBeat::UnexpectedWithRole::${s.role}`,
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Logger,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::HeartBeat::NotLeader", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Candidate,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.HeartBeat> = {
    type: EKVMType.HeartBeat,
    destination: EKVComponent.KVPeer,
    payload: null,
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::ReceivedHeartBeatFrom::${message.source}`,
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
  ], message);

  assertEquals(s.leader, message.source);

  component.shutdown();
});

Deno.test("KVPeer::AppendEntry::Commited", async () => {
  const s: IKVState = {
    ...kvstate,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.AppendEntry> = {
    type: EKVMType.AppendEntry,
    destination: EKVComponent.KVPeer,
    payload: {
      token: "token",
      log: {
        op: EKVOpType.KVGet,
        timestamp: 1235,
        commited: true,
        next: {
          key: "key",
        },
      },
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::ReceivedAppendEntryFrom::${message.source}`
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
    {
      type: EKVMType.StoreLogCommitRequest,
      payload: message.payload,
      source: EKVComponent.KVPeer,
      destination: EKVComponent.Store,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::AppendEntry::NotCommited", async () => {
  const s: IKVState = {
    ...kvstate,
  };

  const component = new KVPeer(s);

  const message: KVM<EKVMType.AppendEntry> = {
    type: EKVMType.AppendEntry,
    destination: EKVComponent.KVPeer,
    payload: {
      token: "token",
      log: {
        op: EKVOpType.KVGet,
        timestamp: 1235,
        commited: false,
        next: {
          key: "key",
        },
      },
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::ReceivedAppendEntryFrom::${message.source}`
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
  ], message);

  component.shutdown();
});

Deno.test("KVPeer::DiscoveryResult::NotSuccess", async () => {
  const s: IKVState = {
    ...kvstate,
  };

  const component = new KVPeer(s);

  const message: KVM<EMType.DiscoveryResult> = {
    type: EMType.DiscoveryResult,
    destination: EKVComponent.KVPeer,
    payload: {
      success: false,
      result: "127.0.0.1",
      source: "http",
    },
    source: "Source",
  };

  await assertMessages([
    {
      type: EMType.LogMessage,
      payload: {
        message: `Peer::ReadyAfter::DiscoveryResult::${message.payload.source}`,
      },
      source: EKVComponent.KVPeer,
      destination: EComponent.Logger,
    },
    {
      type: EKVMType.NewState,
      payload: {
        from: s.role,
        to: ENodeState.Follower,
        reason: `KVPeer::NewState::Reason::DiscoveryResult::${message.payload.success}::${message.payload.source}`
      },
      source: EKVComponent.KVPeer,
      destination: EKVComponent.KVPeer,
    },
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
