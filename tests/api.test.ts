
import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.92.0/testing/asserts.ts";
import { delay } from "https://deno.land/std@0.92.0/async/delay.ts";
import { state } from "../src/state.ts";
import Api from "../src/api.ts";
import Messenger from "../src/messenger.ts";
import { EComponent, EKVOpType, EMonOpType, EMType, EOpType } from "../src/enumeration.ts";
import { IMessage, IMonOp } from "../src/interfaces/interface.ts";
import { IMPayload } from "../src/interfaces/mpayload.ts";

new Api({...state})

function expect(expected: {
  type: EMType, destination: EComponent, payload: IMPayload[EMType]
}, after: {
  type: EMType, destination: EComponent, payload: IMPayload[EMType]
}) {

  let received = false;
  const messages = new Messenger({...state});

  const test = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message: IMessage<EMType> = event.detail;

    received = true;

    assertObjectMatch({...expected.payload}, {...message.payload});
    assertEquals(expected.type, message.type);
  }

  addEventListener(expected.destination, test)
  messages.send(after.type, after.payload, after.destination);
  assertEquals(true, received, 'Message not received');
  removeEventListener(expected.destination, test)
}

Deno.test("Api::ClientRequest::KVOp", () => {

  expect({
    type: EMType.KVOpRequest,
    destination: EComponent.Node,
    payload: {
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
  }, {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: {
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
  })
});

Deno.test("Api::ClientRequest::KVWatch", () => {

  expect({
    type: EMType.KVWatchRequest,
    destination: EComponent.Store,
    payload: {
      token: 'token',
      type: EOpType.KVWatch,
      timestamp: 1234567890,
      payload: {
        expire: 1,
        key: 'key'
      }
    }
  }, {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: {
      token: 'token',
      type: EOpType.KVWatch,
      timestamp: 1234567890,
      payload: {
        expire: 1,
        key: 'key'
      }
    }
  })
});

Deno.test("Api::ClientRequest::MonOp", () => {

  expect({
    type: EMType.MonOpRequest,
    destination: EComponent.Monitor,
    payload: {
      token: 'token',
      type: EOpType.MonOp,
      timestamp: 1234567890,
      payload: {
        op: EMonOpType.Get,
        metric: { key: 'metric' }
      }
    }
  }, {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: {
      token: 'token',
      type: EOpType.MonOp,
      timestamp: 1234567890,
      payload: {
        op: EMonOpType.Get,
        metric: { key: 'metric' }
      }
    }
  })
});

Deno.test("Api::ClientRequest::MonOp", () => {
  expect({
    type: EMType.MonWatchRequest,
    destination: EComponent.Monitor,
    payload: {
      token: 'token',
      type: EOpType.MonWatch,
      timestamp: 1234567890,
      payload: {
        key: 'key',
        expire: 1
      }
    }
  }, {
    type: EMType.ClientRequest,
    destination: EComponent.Api,
    payload: {
      token: 'token',
      type: EOpType.MonWatch,
      timestamp: 1234567890,
      payload: {
        key: 'key',
        expire: 1
      }
    }
  })
});