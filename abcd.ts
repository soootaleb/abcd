import { serve } from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  connectWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
} from "https://deno.land/std/ws/mod.ts";

import { encode } from "https://deno.land/std/encoding/utf8.ts";
import { BufReader } from "https://deno.land/std/io/bufio.ts";
import { TextProtoReader } from "https://deno.land/std/textproto/mod.ts";
import { blue, green, red, yellow } from "https://deno.land/std/fmt/colors.ts";
import { DenoStdInternalError } from "https://deno.land/std@0.66.0/_util/assert.ts";
import { IMessage } from "./interface.ts";

const server = serve(
  { hostname: "127.0.0.1", port: Deno.args[0] == "leader" ? 8080 : 0 },
);

console.log("Started on port " + JSON.stringify(server.listener.addr));

type TState = "leader" | "follower" | "candidate";

// Variables
const id: string = Math.random().toString(36).substring(2, 10) +
  Math.random().toString(36).substring(2, 10);
let store: { [key: string]: any } = {};
let state: TState = "follower";
let heartBeatInterval: number = 3000;
let electionTimeout: number = 40000;
let peers: { [key: string]: WebSocket } = {};
let electionTimeoutId: number;
let heartBeatIntervalId: number;

// Initialisation
const transitionFunction = async (to: TState) => {
  switch (to) {
    case "follower":
      console.log("[MAIN][BECOME FOLLOWER]");
      const sock = await connectWebSocket(
        "ws://127.0.0.1:8080",
        new Headers({
          "x-node-id": id,
        }),
      );
      const addr: Deno.NetAddr = server.listener.addr as Deno.NetAddr;
      sock.send(JSON.stringify({
        type: "joinRequest",
        source: id,
        destination: undefined,
        payload: {
          peerId: id,
          port: addr.port,
        },
      }));
      if (heartBeatIntervalId) {
        clearInterval(heartBeatIntervalId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      //   for await (const msg of sock) {
      //     if (typeof msg == "string") {
      //       console.log("[MAIN] Received", JSON.parse(msg));
      //       handlePeerMessage(JSON.parse(msg));
      //     }
      //   }
      break;
    case "leader":
      console.log("[MAIN][BECOME LEADER]");
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      heartBeatIntervalId = setInterval(() => {
        console.log(green("heartbeat"), Object.keys(peers));
        for (const peerId of Object.keys(peers)) {
          peers[peerId].send(JSON.stringify({
            type: "heartbeat",
            payload: {
              peerId: peerId,
              sourceId: id,
            },
          }));
        }
      }, heartBeatInterval);
      break;
    case "candidate":
      console.log("[MAIN][BECOME CANDIDATE]");
      let votes: number = 0;
      for (const peerId of Object.keys(peers)) {
        peers[peerId].send(JSON.stringify({
          type: "callForVote",
          source: id,
          destination: peerId,
          payload: {
            peerId: peerId,
            sourceId: id,
          },
        }));
      }
    default:
      break;
  }
};

// Messages logic with peers
const handleMessage = async (
  message: IMessage<{
    peerId: string;
    sourceId: string;
    port: string;
  }>,
): Promise<IMessage> => {
  switch (message.type) {
    // case "newConnection":
    //   peers[message.payload.peerId] = {
    //     peerId: message.payload.peerId,
    //   };
    //   return {
    //     type: "connectionAccepted",
    //     source: id,
    //     destination: message.payload.peerId,
    //     payload: {
    //       type: "connectionAccepted",
    //       source: id,
    //       destination: message.payload.peerId,
    //       payload: {
    //         peerId: message.payload.peerId,
    //         state: state,
    //       },
    //     } as IMessage,
    //   };
    case "peerConnectionClosed":
      delete peers[message.payload.peerId];
      return {
        type: "removePeer",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.payload.peerId,
        },
      };
    case "heartbeat":
      console.log(green("received heartbeat"));
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      return {
        type: "heartbeatReceived",
        source: "main",
        destination: "main",
        payload: {
          peerId: message.payload.sourceId,
        },
      };
    case "callForVote":
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      return {
        type: "sendVote",
        source: id,
        destination: message.source,
        payload: {},
      };
    case "joinRequest":
      peers[message.source] = await connectWebSocket(
        "ws://127.0.0.1:" + message.payload.port,
        new Headers({
          "x-node-id": id,
        }),
      );
      console.log(yellow("[MAIN] Connected to peer " + message.source));

      return {
        type: "peerAdded",
        source: "main",
        destination: "main",
        payload: {
          peerId: message.source,
        },
      };
    default:
      return {
        type: "badPeerMessageType",
        source: "main",
        destination: "server",
        payload: {
          message: "peerMessageType " + message.type + " is invalid",
        },
      };
  }
};

// const server: Worker = new Worker(new URL("server.ts", import.meta.url).href, {
//   type: "module",
//   deno: true,
// });

// server.onmessage = (e: MessageEvent) => {
//   console.log("[MAIN] from [SERVER] - " + JSON.stringify(e.data));
//   server.postMessage(handleMessage(e.data));
// };

if (Deno.args[0] == "leader") {
  await transitionFunction("leader");
  console.log(blue(`Peer ${id} is now leader`));
} else {
  await transitionFunction("follower");
}

for await (const request of server) {
  const { conn, r: bufReader, w: bufWriter, headers } = request;

  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  }).then(async (sock: WebSocket) => {
    const id: string = headers.get("x-node-id") as string;
    peers[id] = sock;

    console.log(yellow(`[SERVER] Peer ${id} connected`));

    // self.postMessage({
    //   type: "newConnection",
    //   source: "server",
    //   destination: "main",
    //   payload: {
    //     peerId: id,
    //   },
    // } as IMessage);

    try {
      for await (const ev of sock) {
        if (typeof ev === "string") {
          //   self.postMessage({
          //     type: "newPeerMessage",
          //     source: "server",
          //     destination: "main",
          //     payload: {
          //       peerId: id,
          //       message: JSON.parse(ev),
          //     },
          //   } as IMessage);
          await handleMessage(JSON.parse(ev));
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
