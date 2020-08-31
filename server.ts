// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import { serve, ServerRequest } from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
} from "https://deno.land/std/ws/mod.ts";
import { blue, green, red, yellow } from "https://deno.land/std/fmt/colors.ts";
import { IMessage } from "./interface.ts";

const server = serve(
  { hostname: "127.0.0.1", port: Deno.args[0] == "leader" ? 8080 : 0 },
);

console.log("[SERVER] Started on port " + JSON.stringify(server.listener.addr));

// await sock.send(ev);
self.onmessage = (e: MessageEvent) => {
  const message: IMessage<{
    peerId: string;
    sourceId: string;
    data: Object;
  }> = e.data;
  switch (message.type) {
    case "connectionAccepted":
      const peerId = message.payload.peerId;
      peers[peerId].send(JSON.stringify(e.data));
      break;
    case "sendHeartbeat":
      if (!peers[message.payload.peerId].isClosed) {
        peers[message.payload.peerId].send(JSON.stringify({
          type: "heartbeat",
          payload: {
            peerId: message.payload.peerId,
            sourceId: message.payload.sourceId,
          },
        }));
      } else {
        self.postMessage({
          type: "peerConnectionClosed",
          source: "server",
          destination: "main",
          payload: {
            peerId: message.payload.peerId,
          },
        } as IMessage);
      }
      break;
    case "getResponse":
      peers[message.payload.peerId].send(JSON.stringify({
        type: "get",
        payload: message.payload.data,
      }));
      break;
    case "setResponse":
      peers[message.payload.peerId].send(JSON.stringify({
        type: "set",
        payload: message.payload.data,
      }));
      break;
    case "removePeer":
      if (!peers[message.payload.peerId].isClosed) {
        peers[message.payload.peerId].close()
      }
      delete peers[message.payload.peerId];
      break;
    default:
      console.error("[SERVER] Bad message type from main " + message.type);
  }

  console.log("[SERVER] from [MAIN] " + JSON.stringify(e.data));
};

let peers: { [key: string]: WebSocket } = {};

for await (const request of server) {
  const { conn, r: bufReader, w: bufWriter, headers } = request;

  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  }).then(async (sock: WebSocket) => {
    const id: string = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    self.postMessage({
      type: "newConnection",
      source: "server",
      destination: "main",
      payload: {
        peerId: id,
      },
    } as IMessage);

    peers[id] = sock;

    try {
      for await (const ev of sock) {
        if (typeof ev === "string") {
          self.postMessage({
            type: "newPeerMessage",
            source: "server",
            destination: "main",
            payload: {
              peerId: id,
              message: JSON.parse(ev),
            },
          } as IMessage);
        } else {
          sock.send(JSON.stringify({
            type: "badMessageFormat",
            payload: {
              message: "Please send JSON formated string",
            },
          }));
          await request.respond({ status: 400 });
        }
      }
    } catch (err) {
      if (!sock.isClosed) {
        sock.send(JSON.stringify({
          type: "connectionFailedError",
          payload: {
            message: "Failed to keep connection " + err,
          },
        }));
        await request.respond({ status: 400 });
        await sock.close(1000).catch(console.error);
      }
    }
  }).catch(async (err) => {
    await request.respond({ status: 400 });
  });
}
