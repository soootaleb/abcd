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

type TState = "leader" | "follower" | "candidate";

// Variables
const id: string = Math.random().toString(36).substring(2, 10) +
  Math.random().toString(36).substring(2, 10);
let store: { [key: string]: any } = {};
let state: TState = "follower";
let heartBeatInterval: number = 30000;
let electionTimeout: number = 2000;
let peers: { [key: string]: { peerId: string } } = {};
let electionTimeoutId: number;
let heartBeatIntervalId: number;

// Initialisation
const transitionFunction = async (to: TState) => {
  switch (to) {
    case "follower":
      console.log("[MAIN][BECOME FOLLOWER]");
      const sock = await connectWebSocket("ws://127.0.0.1:8080", new Headers({
        'x-node-id': id
      }));
      if (heartBeatIntervalId) {
        clearInterval(heartBeatIntervalId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      for await (const msg of sock) {
        if (typeof msg == "string") {
          console.log("[MAIN] Received", JSON.parse(msg));
          handlePeerMessage(JSON.parse(msg));
        }
      }
      break;
    case "leader":
      console.log("[MAIN][BECOME LEADER]");
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      heartBeatIntervalId = setInterval(() => {
        for (const peerId of Object.keys(peers)) {
          server.postMessage({
            type: "sendHeartbeat",
            payload: {
              peerId: peerId,
              sourceId: id,
            },
          });
        }
      }, heartBeatInterval);
      break;
    case "candidate":
      console.log("[MAIN][BECOME CANDIDATE]");
      let votes: number = 0;
      for (const peerId of Object.keys(peers)) {
        server.postMessage({
          type: "callForVote",
          source: id,
          destination: peerId,
          payload: {
            peerId: peerId,
            sourceId: id,
          },
        });
      }
      break;
    default:
      break;
  }
};

const handlePeerMessage = (
  message: IMessage<any>,
): IMessage => {
  switch (message.type) {
    case "get":
      return {
        type: "getResponse",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.source,
          data: {
            key: message.payload.data.key,
            value: store[message.payload.data.key],
          },
        },
      };
    case "set":
      store[message.payload.data.key] = message.payload.data.value;
      return {
        type: "setResponse",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.source,
          data: {
            key: message.payload.data.key,
            value: store[message.payload.data.key],
            commited: true,
          },
        },
      };
    case "heartbeat":
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
    case "connectionAccepted":
      
      console.log(yellow('[MAIN] Connected to peer ' + message.source))
      
      peers[message.source] = {
        peerId: message.source,
      };

      return {
        type: "peerAdded",
        source: "main",
        destination: "main",
        payload: {
          peerId: message.source
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

// Messages logic with peers
const handleMessage = (message: IMessage<any>): IMessage => {
  switch (message.type) {
    case "heartbeat":
      clearTimeout(electionTimeoutId);
      transitionFunction("follower");
    case "newPeerMessage":
      return handlePeerMessage(message);
    case "set":
      return handlePeerMessage(message);
    case "newConnection":
      peers[message.payload.peerId] = {
        peerId: message.payload.peerId,
      };
      return {
        type: "connectionAccepted",
        source: id,
        destination: message.payload.peerId,
        payload: {
          type: "connectionAccepted",
          source: id,
          destination: message.payload.peerId,
          payload: {
            peerId: message.payload.peerId,
            state: state,
          },
        } as IMessage,
      };
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
      break;
    default:
      return {
        type: "error",
        source: "main",
        destination: "server",
        payload: {
          message: "bad message type " + message.type,
        },
      };
  }
};

const server: Worker = new Worker(new URL("server.ts", import.meta.url).href, {
  type: "module",
  deno: true,
});

server.onmessage = (e: MessageEvent) => {
  console.log("[MAIN] from [SERVER] - " + JSON.stringify(e.data));
  server.postMessage(handleMessage(e.data));
};

if (Deno.args[0] == "leader") {
  await transitionFunction("leader");
  console.log(blue(`[MAIN] Peer ${id} is now leader`));
} else {
  await transitionFunction("follower");

}
