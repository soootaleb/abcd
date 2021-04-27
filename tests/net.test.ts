import { state } from "../src/state.ts";
import { EComponent, EMType } from "../src/enumeration.ts";
import { assertMessages } from "./helpers.ts";
import Net from "../src/net.ts";
import { IMessage, IState } from "../src/interfaces/interface.ts";
import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std/testing/asserts.ts";

Deno.test("Net::PeerConnectionOpen", async () => {
  const s: IState = { ...state };
  new Net(s, false)

  const payload = {
    peerIp: "127.0.0.1",
  };

  const message: IMessage<EMType.PeerConnectionOpen> = {
    type: EMType.PeerConnectionOpen,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  }

  await assertMessages([
    {
    ...message,
    destination: EComponent.Node,
    },
    {
      ...message,
      destination: EComponent.Logger,
    }
  ], message)

  assertObjectMatch(s.net.peers[message.payload.peerIp], payload);
});

Deno.test("Net::PeerConnectionClose", async () => {

  const payload = "127.0.0.1";

  const s: IState = {
    ...state,
    net: {
      ...state.net,
      peers: {
        [payload]: {
          peerIp: payload
        }
      }
    }
  };

  new Net(s, false);

  const message: IMessage<EMType.PeerConnectionClose> = {
    type: EMType.PeerConnectionClose,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  await assertMessages([
    {
      ...message,
      destination: EComponent.Logger,
    }
  ], message)

  assertEquals(false, Object.keys(s.net.peers).includes(payload), "Peer still in state")
});

Deno.test("Net::ClientConnectionOpen", async () => {
  const s: IState = { ...state };
  new Net(s, false);

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

  await assertMessages([
    {
      ...message,
      destination: EComponent.Logger,
    },
    {
      ...message,
      destination: EComponent.Node,
    }
  ], message)

  assertObjectMatch(s.net.clients[message.payload.clientIp], payload);
});

Deno.test("Net::ClientConnectionClose", async () => {
  const payload = "127.0.0.1";

  const s: IState = {
    ...state,
    net: {
      ...state.net,
      clients: {
        [payload]: {
          clientIp: payload,
          remoteAddr: {
            transport: "tcp" as ("tcp" | "udp"),
            hostname: "localhost",
            port: 8080,
          },
          clientId: 1,
        }
      }
    }
  };

  new Net(s, false);

  const message: IMessage<EMType.ClientConnectionClose> = {
    type: EMType.ClientConnectionClose,
    source: "Source",
    destination: EComponent.Net,
    payload: payload,
  };

  await assertMessages([
    {
      ...message,
      destination: EComponent.Api,
    },
    {
      ...message,
      destination: EComponent.Logger,
    }
  ], message)

  assertEquals(false, Object.keys(s.net.clients).includes(payload), "Client still in state")
});
