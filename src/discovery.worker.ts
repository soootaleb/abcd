// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import {
  serve,
  Server,
  ServerRequest,
} from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket as DenoWS,
} from "https://deno.land/std/ws/mod.ts";
import * as c from "https://deno.land/std/fmt/colors.ts";
import type { IMessage } from "./interface.ts";

declare const self: Worker;

const server = Deno.listenDatagram(
  { port: 8888, transport: "udp", hostname: "0.0.0.0" },
);

//   let uis: DenoWS[] = [];
//   let peers: { [key: string]: DenoWS | WebSocket } = {};
//   let clients: { [key: string]: DenoWS } = {};

const token = Math.random().toString(36).substring(7);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");
const multicast: Deno.NetAddr = { port: 8888, transport: "udp", hostname: "224.0.0.1"};

self.postMessage({
  type: "discoveryServerStarted",
  source: "discovery.worker",
  destination: "discovery",
  payload: {
    token: token
  },
});

function handleMessage(message: IMessage<any>): IMessage {
  switch (message.type) {
    case "sendDiscoveryBeacon":
      server.send(encoder.encode(token), multicast);
      return {
        type: "discoveryBeaconSent",
        source: "discovery.worker",
        destination: "log",
        payload: {
          token: token
        }
      }
    default:
      return {
        type: "invalidMessageType",
        source: "discovery.worker",
        destination: "log",
        payload: {
          message: message,
        },
      };
  }
}

self.onmessage = async (e: MessageEvent) => {
  const message: IMessage<{
    peerIp: string;
    sourceId: string;
    data: Record<string, unknown>;
  }> = e.data;

  const destination = message.destination;

  if (destination == "discovery.worker") {
    self.postMessage(handleMessage(message));
  } else {
    self.postMessage({
      type: "invalidMessageDestination",
      source: "discovery.worker",
      destination: "log",
      payload: {
        message: message,
      },
    } as IMessage);
  }
};

for await (const datagram of server) {
  const [data, addr] = datagram as [Uint8Array, Deno.NetAddr];

  if (decoder.decode(data) !== token) {
    self.postMessage({
      type: "discoveryBeacon",
      source: addr.hostname,
      destination: "discovery",
      payload: {
        addr: addr,
        token: decoder.decode(data)
      },
    });
  }

}
