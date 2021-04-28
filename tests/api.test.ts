import { state } from "../src/state.ts";
import Api from "../src/api.ts";
import { EComponent, EKVOpType, EMonOpType, EMType, ENodeState, EOpType } from "../src/enumeration.ts";
import { assertMessages } from "./helpers.ts";
import { IMessage, IState } from "../src/interfaces/interface.ts";
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

Deno.test("Api::ClientRequest::KVOp", async () => {
  
  const s: IState = {
    ...state,
    role: ENodeState.Leader
  };

  const component = new Api(s)

  const payload = {
    token: 'token',
    type: EOpType.KVOp,
    timestamp: 1234567890,
    payload: {
      op: EKVOpType.Get,
      kv: {
        key: 'key',
        value: 'value'
      }
    }
  }

  const message: IMessage<EMType.ClientRequest> = {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([
    {
      type: EMType.KVOpRequest,
      destination: EComponent.Store,
      payload: payload,
      source: EComponent.Api
    }
  ], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown();
});

Deno.test("Api::ClientRequest::KVWatch", async () => {
  
  const s: IState = { ...state };
  const component = new Api(s)
  const payload = {
    token: 'token',
    type: EOpType.KVWatch,
    timestamp: 1234567890,
    payload: {
      expire: 1,
      key: 'key'
    }
  }

  const message = {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([
    {
      type: EMType.KVWatchRequest,
      destination: EComponent.Store,
      payload: payload,
      source: EComponent.Api
    }
  ], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown();
});

Deno.test("Api::ClientRequest::MonOp", async () => {
  const s: IState = { ...state };

  const component = new Api(s)

  const payload = {
    token: 'token',
    type: EOpType.MonOp,
    timestamp: 1234567890,
    payload: {
      op: EMonOpType.Get,
      metric: { key: 'metric' }
    }
  };

  const message = {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([{
    type: EMType.MonOpRequest,
    destination: EComponent.Monitor,
    payload: payload,
    source: EComponent.Api
  }], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown()
});

Deno.test("Api::ClientRequest::MonWatch", async () => {

  const s: IState = { ...state };
  const component = new Api(s)
  const payload = {
    token: 'token',
    type: EOpType.MonWatch,
    timestamp: 1234567890,
    payload: {
      key: 'key',
      expire: 1
    }
  }

  const message = {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([{
    type: EMType.MonWatchRequest,
    destination: EComponent.Monitor,
    payload: payload,
    source: EComponent.Api
  }], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown()
});

Deno.test("Api::ClientResponse", async () => {

  const s: IState = {
    ...state,
    net: {
      ...state.net,
      requests: {
        "token": "127.0.0.1"
      }
    }
  };

  const component = new Api(s)
  const payload = {
    token: 'token',
    type: EOpType.MonWatch,
    timestamp: 1234567890,
    payload: {
      key: 'key',
      expire: 1
    }
  }

  const message = {
    type: EMType.ClientResponse,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([{
    type: EMType.ClientResponse,
    destination: "127.0.0.1",
    payload: payload,
    source: EComponent.Api
  }], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), false);

  component.shutdown()
});

Deno.test("Api::ClientNotification", async () => {

  const s: IState = {
    ...state,
    net: {
      ...state.net,
      requests: {
        "token": "127.0.0.1"
      }
    }
  };

  const component = new Api(s)
  const payload = {
    token: 'token',
    type: EOpType.MonWatch,
    timestamp: 1234567890,
    payload: {
      key: 'key',
      expire: 1
    }
  }

  const message = {
    type: EMType.ClientNotification,
    destination: EComponent.Api,
    payload: payload,
    source: "Source"
  }

  await assertMessages([{
    type: EMType.ClientNotification,
    destination: "127.0.0.1",
    payload: payload,
    source: EComponent.Api
  }], message)

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);

  component.shutdown()
});

Deno.test("Api::ClientConnectionClose", async () => {

  const s: IState = {
    ...state,
    net: {
      ...state.net,
      requests: {
        "token-1": "127.0.0.1",
        "token-2": "127.0.0.1",
        "token-3": "127.0.0.3"
      }
    }
  };

  const component = new Api(s)

  const message: IMessage<EMType.ClientConnectionClose> = {
    type: EMType.ClientConnectionClose,
    destination: EComponent.Api,
    payload: "127.0.0.1",
    source: "Source"
  }

  await assertMessages([], message)

  // Let the time for component to play the message sent
  await new Promise((resolve) => {
    setTimeout(() => {
      assertEquals(Object.values(s.net.requests).includes("127.0.0.1"), false);
      assertEquals(Object.values(s.net.requests).includes("127.0.0.3"), true)
      assertEquals(s.mon.watchers[message.payload] === undefined, true)
      resolve(true);
    }, 10);
  })

  component.shutdown()
});