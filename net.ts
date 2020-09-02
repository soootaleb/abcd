// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import { serve, ServerRequest } from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
  connectWebSocket,
} from "https://deno.land/std/ws/mod.ts";
import { blue, green, red, yellow } from "https://deno.land/std/fmt/colors.ts";
import { IMessage } from "./interface.ts";

let id: string = "tmp-id";
let port: string = "tmp-port";

const server = serve({
  hostname: "127.0.0.1",
  port: Deno.args[0] == "8080" ? 8080 : 0,
});

let peers: { [key: string]: WebSocket } = {};

console.log(blue("Started server"), server.listener.addr);

async function handleMainMessage(
  message: IMessage<any>,
): Promise<IMessage> {
  switch (message.type) {
    case "addPeer":
      const s = server.listener.addr as Deno.NetAddr;
      const sock = await connectWebSocket(
        "ws://127.0.0.1:" + message.payload.peerPort,
        new Headers({
          "x-node-id": id,
          "x-node-port": s.port.toString(),
        }),
      );
      peers[message.payload.peerId] = sock;
      for await (const msg of sock) {
        if (typeof msg == "string") {
          const message = JSON.parse(msg);
          if (message.type != "heartBeat") {
            console.log("[NET] Received", message);
          }
          if (message.destination == id) {
            self.postMessage(message);
          } else {
            sock.send(JSON.stringify({
              type: "messageNotForMe",
              source: id,
              destination: message.source,
              payload: {
                myIdIs: id,
                yourDestinationIs: message.destination,
              },
            }));
          }
        }
      }

      // Reaches here if the connection is lost
      if (!sock.isClosed) {
        sock.close();
      }

      return {
        type: "peerConnectionLost",
        source: "net",
        destination: "main",
        payload: {
          peerId: message.payload.peerId,
        },
      };
    case "removePeer":
      if (!peers[message.payload.peerId].isClosed) {
        peers[message.payload.peerId].close();
      }
      delete peers[message.payload.peerId];
      return {
        type: "peerRemovedSuccess",
        source: "net",
        destination: "main",
        payload: {
          peerId: message.payload.peerId,
        },
      };
    case "setNodeId":
      id = message.payload.id;
      return {
        type: "idSetSuccess",
        source: "net",
        destination: "main",
        payload: {
          id: message.payload.id,
        },
      };
    default:
      return {
        type: "invalidMessageType",
        source: "net",
        destination: "main",
        payload: {
          message: message,
        },
      };
  }
}

self.onmessage = async (e: MessageEvent) => {
  const message: IMessage<{
    peerId: string;
    sourceId: string;
    data: Object;
  }> = e.data;

  if (message.type != "heartBeat") {
    console.log("[NET] Received", message);
  }

  if (id == "tmp-id" && message.type != "setNodeId") {
    self.postMessage({
      type: "nodeIdNotSet",
      source: "net",
      destination: "main",
      payload: {
        message: "received message while id is set to " + id,
      },
    });
    throw new Error(red("[NET] Received message while ID is not set"));
  }

  const destination = message.destination;

  if (
    destination.length == 16 &&
    Object.keys(peers).includes(destination) &&
    !peers[destination].isClosed
  ) {
    peers[destination].send(JSON.stringify(message));
  } else if (destination == "net") {
    self.postMessage(await handleMainMessage(message));
  } else {
    console.error(
      red("[NET] Bad destination " + message.destination),
    );
    self.postMessage({
      type: "invalidMessageDestination",
      source: "net",
      destination: "main",
      payload: {
        invalidMessageDestination: destination,
        availablePeers: Object.keys(peers),
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
    const peerId: string = headers.get("x-node-id") as string;
    const peerPort: number = parseInt(headers.get("x-node-port") as string);

    peers[peerId] = sock;

    console.log(yellow(`[NET] Peer ${peerId} connected`));

    self.postMessage({
      type: "newConnection",
      source: "net",
      destination: "main",
      payload: {
        peerId: peerId,
        peerPort: peerPort,
      },
    } as IMessage);

    try {
      for await (const ev of sock) {
        if (typeof ev === "string") {
          self.postMessage(JSON.parse(ev));
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

      // Reaches here if the connection is lost
      if (!sock.isClosed) {
        sock.close();
      }

      self.postMessage({
        type: "peerConnectionLost",
        source: "net",
        destination: "main",
        payload: {
          peerId: peerId,
        },
      });
    } catch (err) {
      if (!sock.isClosed) {
        sock.send(JSON.stringify({
          type: "connectionFailedError",
          source: id,
          destination: "unknown",
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
