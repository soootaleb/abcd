import { state } from "../src/state.ts";
import Node from "../src/node.ts";
import { EComponent, EMType, ENodeState } from "../src/enumeration.ts";
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

  await assertMessages([], message);

  await new Promise((resolve) => {
    setTimeout(() => {
      assertEquals(typeof s.electionTimeoutId === "number", true);
      assertEquals(s.role, ENodeState.Follower);
      resolve(true);
    }, 10);
  });

  await new Promise((resolve) => {
    setTimeout(() => {
      assertEquals(typeof s.electionTimeoutId === "number", false);
      assertEquals(s.role, ENodeState.Leader);
      resolve(true);
    }, 100);
  });

  clearInterval(s.heartBeatIntervalId);
  delete s.heartBeatIntervalId;

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

  await new Promise((resolve) => {
    setTimeout(() => {
      assertEquals(typeof s.heartBeatIntervalId === "number", true);
      assertEquals(s.term, 2);
      assertEquals(s.role, ENodeState.Leader);
      assertEquals(s.leader, EComponent.Node);
      resolve(true);
    }, 10);
  });

  clearInterval(s.heartBeatIntervalId);
  delete s.heartBeatIntervalId;

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
    }
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
