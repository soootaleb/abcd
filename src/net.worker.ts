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
  WebSocket as DenoWS,
} from "https://deno.land/std/ws/mod.ts";
import * as c from "https://deno.land/std/fmt/colors.ts";
import type { IMessage } from "./interface.ts";

declare const self: Worker;

const server = serve({
  hostname: "0.0.0.0",
  port: 8080,
});

let uis: DenoWS[] = [];
let peers: { [key: string]: DenoWS | WebSocket } = {};
let clients: { [key: string]: DenoWS } = {};

self.postMessage({
  type: "serverStarted",
  source: "net.worker",
  destination: "node",
  payload: server.listener.addr,
});

function handleMessage(
  message: IMessage<any>,
): IMessage {
  switch (message.type) {
    case "openPeerConnectionRequest":
      if (peers[message.payload.peerIp]) {
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

      const sock = new WebSocket(`ws://${message.payload.peerIp}:8080/peer`)

      sock.onopen = () => {
        peers[message.payload.peerIp] = sock;
      }

      sock.onmessage = (ev: MessageEvent) => {
        self.postMessage({
          ...JSON.parse(ev.data),
          source: message.payload.peerIp,
          destination: "node"
        });
      }

      sock.onclose = (ev: CloseEvent) => {
        delete peers[message.payload.peerIp];
        return {
          type: "peerConnectionClose",
          source: "net.worker",
          destination: "net",
          payload: {
            peerIp: message.payload.peerIp,
          },
        };
      }

      return {
        type: "peerConnectionSuccess",
        source: "net.worker",
        destination: "log",
        payload: {
          peerIp: message.payload.peerIp,
        },
      };
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

self.onmessage = (e: MessageEvent) => {
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
    self.postMessage(handleMessage(message));

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
  }).then(async (sock: DenoWS) => {
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
            source: hostname,
            destination: "node"
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
