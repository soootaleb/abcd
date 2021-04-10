import { state } from "../src/state.ts";
import { EComponent, EMType } from "../src/enumeration.ts";
import { expect } from "./helpers.ts";
import Net from "../src/net.ts";
import { IMessage, IState } from "../src/interfaces/interface.ts";
import { assertObjectMatch, assertEquals } from "https://deno.land/std/testing/asserts.ts";

const s: IState = { ...state };

new Net(s);

Deno.test("Net::PeerConnectionOpen", () => {
  const payload = {
    peerIp: "127.0.0.1",
  };

  const message: IMessage<EMType.PeerConnectionOpen> = {
    type: EMType.PeerConnectionOpen,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.Node,
  }, message);

  expect({
    ...message,
    destination: EComponent.Logger,
  }, message);

  assertObjectMatch(s.net.peers[message.payload.peerIp], payload);
});

Deno.test("Net::ClientConnectionOpen", () => {
  const payload = {
    clientIp: "127.0.0.1",
    remoteAddr: {
      transport: "tcp" as ("tcp" | "udp"),
      hostname: "localhost",
      port: 8080,
    },
    clientId: 1,
  };

  const message: IMessage<EMType.ClientConnectionOpen> = {
    type: EMType.ClientConnectionOpen,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.Logger,
  }, message);

  assertObjectMatch(s.net.clients[message.payload.clientIp], payload);
});

Deno.test("Net::ClientConnectionClose", () => {
  const payload = {
    clientIp: "127.0.0.1",
  };

  const message: IMessage<EMType.ClientConnectionClose> = {
    type: EMType.ClientConnectionClose,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.Monitor,
  }, message);
});

Deno.test("Net::PeerConnectionRequest", () => {
  const payload = {
    peerIp: "127.0.0.1",
  };

  const message: IMessage<EMType.PeerConnectionRequest> = {
    type: EMType.PeerConnectionRequest,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.NetWorker,
  }, message);
});

Deno.test("Net::PeerConnectionComplete", () => {
  const payload = {
    peerIp: "127.0.0.1",
  };

  const message: IMessage<EMType.PeerConnectionComplete> = {
    type: EMType.PeerConnectionComplete,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.Logger,
  }, message);

  assertObjectMatch(s.net.peers[message.payload.peerIp], payload);
});

Deno.test("Net::PeerServerStarted", () => {
  const payload = {
    transport: "tcp" as ("tcp" | "udp"),
    hostname: "localhost",
    port: 8080,
  };

  const message: IMessage<EMType.PeerServerStarted> = {
    type: EMType.PeerServerStarted,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  expect({
    ...message,
    destination: EComponent.Node,
  }, message);

  assertEquals(s.net.ready, true);
});
