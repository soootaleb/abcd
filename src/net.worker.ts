// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import {
  serve,
  ServerRequest,
  Server,
} from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
  connectWebSocket,
} from "https://deno.land/std/ws/mod.ts";
import * as c from "https://deno.land/std/fmt/colors.ts";
import type { IMessage } from "./interface.ts";

declare const self: Worker;

const server = serve({
  hostname: "127.0.0.1",
  port: Deno.args[0] == "8080" ? 8080 : 0,
});

const addr: Deno.NetAddr = server.listener.addr as Deno.NetAddr;
const port: string = addr.port.toString();
let peers: { [key: string]: WebSocket } = {};
let ui: WebSocket | undefined;

self.postMessage({
  type: "serverStarted",
  source: "worker",
  destination: "net",
  payload: server.listener.addr,
});

async function handleMessage(
  message: IMessage<any>,
): Promise<IMessage> {
  switch (message.type) {
    case "connectToPeer":
      if (
        peers[message.payload.peerPort] &&
        !peers[message.payload.peerPort].isClosed
      ) {
        return {
          type: "peerConnectionExists",
          source: "worker",
          destination: "net",
          payload: {
            peerPort: message.payload.peerPort,
          },
        };
      }

      const sock = await connectWebSocket(
        "ws://127.0.0.1:" + message.payload.peerPort,
        new Headers({ "x-node-port": port }), // I need to send it by header instead of sock.conn because of a bug
      );

      if (!sock.isClosed) {
        peers[message.payload.peerPort] = sock;

        for await (const msg of sock) {
          if (typeof msg == "string") {
            const peerMessage = JSON.parse(msg);
            if (peerMessage.destination == port) {
              self.postMessage(peerMessage);
            } else {
              sock.send(JSON.stringify({
                type: "messageNotForMe",
                source: port,
                destination: peerMessage.source,
                payload: {
                  myIdIs: port,
                  yourDestinationIs: peerMessage.destination,
                },
              }));
            }
          }
        }

        delete peers[message.payload.peerPort];

        return {
          type: "peerConnectionLost",
          source: "worker",
          destination: "net",
          payload: {
            peerPort: message.payload.peerPort,
          },
        };
      } else {
        return {
          type: "peerConnectionFailed",
          source: "worker",
          destination: "net",
          payload: {
            peerPort: message.payload.peerPort,
          },
        };
      }
    default:
      return {
        type: "invalidMessageType",
        source: "worker",
        destination: "net",
        payload: {
          message: message,
        },
      };
  }
}

self.onmessage = async (e: MessageEvent) => {
  const message: IMessage<{
    peerPort: string;
    sourceId: string;
    data: Object;
  }> = e.data;

  const destination = message.destination;

  if (
    /^[0-9]{4,5}$/g.test(destination) &&
    Object.keys(peers).includes(destination)
  ) {
    peers[destination].send(JSON.stringify(message));
  } else if (destination == "ui") {
    if (ui != undefined) {
      ui.send(JSON.stringify(message));
    }
  } else if (destination == "worker") {
    self.postMessage(await handleMessage(message));
  } else {
    self.postMessage({
      type: "invalidMessageDestination",
      source: "worker",
      destination: "net",
      payload: {
        invalidMessageDestination: destination,
        availablePeers: Object.keys(peers),
        message: message,
      },
    } as IMessage);
  }
};

for await (const request of server) {
  const { conn, r: bufReader, w: bufWriter, headers } = request;

  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  }).then(async (sock: WebSocket) => {
    const peerPort: string = headers.get("x-node-port") as string;

    if (peerPort != null) {
      peers[peerPort] = sock;

      self.postMessage({
        type: "newConnection",
        source: "worker",
        destination: "net",
        payload: {
          peerPort: peerPort,
        },
      } as IMessage);
    } else {
      ui = sock;
    }

    

    for await (const ev of sock) {
      if (typeof ev === "string") {
        self.postMessage(JSON.parse(ev));
      }
    }

    if (peerPort != null) {
      delete peers[peerPort];

      self.postMessage({
        type: "peerConnectionLost",
        source: "worker",
        destination: "net",
        payload: {
          peerPort: peerPort,
        },
      });
    } else {
      ui = undefined;
    }
  });
}
