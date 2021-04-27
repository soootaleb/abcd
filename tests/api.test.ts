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

  assertEquals(true, Object.keys(s.net.requests).includes(payload.token));
  assertEquals(message.source, s.net.requests[payload.token]);

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

  assertEquals(true, Object.keys(s.net.requests).includes(payload.token));
  assertEquals(message.source, s.net.requests[payload.token]);

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

  assertEquals(true, Object.keys(s.net.requests).includes(payload.token));
  assertEquals(message.source, s.net.requests[payload.token]);

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

  assertEquals(true, Object.keys(s.net.requests).includes(payload.token));
  assertEquals(message.source, s.net.requests[payload.token]);

  component.shutdown()
});