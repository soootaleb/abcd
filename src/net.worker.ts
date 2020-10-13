// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import {
  serve,
  ServerRequest,
  Server,
} from "https://deno.land/std@0.65.0/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
  connectWebSocket,
} from "https://deno.land/std@0.65.0/ws/mod.ts";
import * as c from "https://deno.land/std/fmt/colors.ts";
import type { IMessage } from "./interface.ts";

declare const self: Worker;

const server = serve({
  hostname: "0.0.0.0",
  port: 8080,
});

let uis: WebSocket[] = [];
let peers: { [key: string]: WebSocket } = {};
let clients: { [key: string]: WebSocket } = {};

self.postMessage({
  type: "serverStarted",
  source: "net.worker",
  destination: "node",
  payload: server.listener.addr,
});

async function handleMessage(
  message: IMessage<any>,
): Promise<IMessage> {
  switch (message.type) {
    case "openPeerConnectionRequest":
      if (
        peers[message.payload.peerIp] &&
        !peers[message.payload.peerIp].isClosed
      ) {
        return {
          type: "openPeerConnectionFail",
          source: "net.worker",
          destination: "log",
          payload: {
            reason: "peer connection already exists",
            peerIp: message.payload.peerIp,
          },
        };
      }

      const sock = await connectWebSocket(
        `ws://${message.payload.peerIp}:8080/peer`,
      );

      if (!sock.isClosed) {
        peers[message.payload.peerIp] = sock;

        for await (const msg of sock) {
          if (typeof msg == "string") {
            self.postMessage({
              ...JSON.parse(msg),
              source: message.payload.peerIp,
              destination: "node"
            });
          }
        }

        delete peers[message.payload.peerIp];

        return {
          type: "peerConnectionClose",
          source: "net.worker",
          destination: "net",
          payload: {
            peerIp: message.payload.peerIp,
          },
        };
      } else {
        return {
          type: "peerConnectionFailed",
          source: "net.worker",
          destination: "net",
          payload: {
            peerIp: message.payload.peerIp,
          },
        };
      }
      break;
    default:
      return {
        type: "invalidMessageType",
        source: "net.worker",
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
    data: Object;
  }> = e.data;

  const destination = message.destination;

  // If it's a peer, send it to peer
  if (Object.keys(peers).includes(destination)) {
    peers[destination].send(JSON.stringify(message));
  
  // If it's a client, send it to client
  } else if (Object.keys(clients).includes(destination)) {
    clients[destination].send(JSON.stringify(message));

  // If it's "worker", handle message here
  } else if (destination == "net.worker") {
    self.postMessage(await handleMessage(message));

  // If it's "ui" send it to all UIs connected
  } else if (destination == "ui") {
    if (uis.length) {
      for (const ui of uis) {
        if (!ui.isClosed) {
          ui.send(JSON.stringify(message));
        }
      }
    }
  } else {
    self.postMessage({
      type: "invalidMessageDestination",
      source: "net.worker",
      destination: "log",
      payload: {
        invalidMessageDestination: destination,
        availablePeers: Object.keys(peers),
        availableClients: Object.keys(clients),
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
    const remoteAddr: Deno.NetAddr = request.conn.remoteAddr as Deno.NetAddr;
    const hostname: string = remoteAddr.hostname;

    if (request.url === "/client") {
      clients[hostname] = sock;

      self.postMessage({
        type: "clientConnectionOpen",
        source: "net.worker",
        destination: "net",
        payload: {
          clientIp: hostname,
          remoteAddr: remoteAddr,
          clientId: request.conn.rid,
        },
      });

      for await (const ev of sock) {
        if (typeof ev === "string") {
          self.postMessage({
            ...JSON.parse(ev),
            source: hostname,
            destination: "node"
          });
        }
      }

      delete clients[hostname];

      self.postMessage({
        type: "clientConnectionClose",
        source: "net.worker",
        destination: "net",
        payload: {
          clientIp: hostname,
        },
      });
    } else if (request.url === "/ui") {
      uis.push(sock);

      for await (const ev of sock) {
        if (typeof ev === "string") {
          self.postMessage({
            ...JSON.parse(ev),
            source: "ui",
            destination: "node"
          });
        }
      }

      uis = uis.filter((ui) => ui.conn.rid === sock.conn.rid);

    } else if (request.url === "/peer") {

      peers[hostname] = sock;

      self.postMessage({
        type: "peerConnectionOpen",
        source: "net.worker",
        destination: "net",
        payload: {
          peerIp: hostname,
        },
      });

      for await (const ev of sock) {
        if (typeof ev === "string") {
          self.postMessage({
            ...JSON.parse(ev),
            source: hostname
          });
        }
      }

      delete peers[hostname];

      self.postMessage({
        type: "peerConnectionClose",
        source: "net.worker",
        destination: "net",
        payload: {
          peerIp: hostname,
          remoteAddr: remoteAddr,
          peerId: request.conn.rid,
        },
      });
    }
  });
}
