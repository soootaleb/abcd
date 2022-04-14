import { kvstate } from "../src/kv/kvstate.ts";
import { KVApi } from "../src/kv/kvapi.ts";
import { assertEquals } from "std/testing/asserts.ts";
import { EMType } from "ddapps/messages.ts";
import { IKVState } from "../src/kv/interface.ts";
import { EKVComponent, ENodeState } from "../src/kv/enumeration.ts";
import { EKVOpType, IKVRequestPayload, IKVResponsePayload } from "../src/kv/operation.ts";
import { KVM } from "../src/kv/type.ts";
import { EKVMType, IKVMPayload } from "../src/kv/messages.ts";
import { getAssert } from "ddapps/testing.ts";

const assertMessages = getAssert<
    IKVRequestPayload,
    IKVResponsePayload,
    IKVMPayload
>();

Deno.test("KVApi::ClientRequest::KVGet", async () => {
  const s: IKVState = {
    ...kvstate,
    role: ENodeState.Leader,
  };

  const component = new KVApi(s);

  const payload = {
    token: "token",
    type: EKVOpType.KVGet,
    trace: false,
    timestamp: 1234567890,
    payload: {
      key: "key",
      value: "value",
    }
  };

  const message: KVM<EMType.ClientRequest> = {
    type: EMType.ClientRequest,
    destination: EKVComponent.KVApi,
    payload: payload,
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.KVOpRequest,
      destination: EKVComponent.Store,
      payload: payload,
      source: EKVComponent.KVApi,
    },
  ], message);

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown();
});

Deno.test("KVApi::ClientRequest::KVWatch", async () => {
  const s: IKVState = { ...kvstate };
  const component = new KVApi(s);
  const payload = {
    token: "token",
    type: EKVOpType.KVWatch,
    timestamp: 1234567890,
    payload: {
      expire: 1,
      key: "key",
    },
  };

  const message = {
    type: EMType.ClientRequest,
    destination: EKVComponent.KVApi,
    payload: payload,
    source: "Source",
  };

  await assertMessages([
    {
      type: EKVMType.KVWatchRequest,
      destination: EKVComponent.Store,
      payload: payload,
      source: EKVComponent.KVApi,
    },
  ], message);

  assertEquals(Object.keys(s.net.requests).includes(payload.token), true);
  assertEquals(s.net.requests[payload.token], message.source);

  component.shutdown();
});
