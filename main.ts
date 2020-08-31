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
const id: string = Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15);
let store: { [key: string]: any } = {};
let state: TState = "follower";
let heartBeatInterval: number = 3000;
let electionTimeout: number = 1000;
let peers: { [key: string]: {peerId: string} } = {};
let electionTimeoutId: number;
let heartBeatIntervalId: number;

// Initialisation
const transitionFunction = (to: TState) => {
  switch (to) {
    case "follower":
      console.log("[MAIN][BECOME FOLLOWER]");
      if (heartBeatIntervalId) {
        clearInterval(heartBeatIntervalId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      break;
    case "leader":
      console.log("[MAIN][BECOME LEADER]");
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      heartBeatIntervalId = setInterval(() => {
        for (const peerId of Object.keys(peers)) {
          server.postMessage({
            type: 'sendHeartbeat',
            payload: {
              peerId: peerId,
              sourceId: id
            }
          })
        }
      }, heartBeatInterval);
      break;
    case "candidate":
      console.log("[MAIN][BECOME CANDIDATE]");
      let votes: number = 0;
      for (const peerId of Object.keys(peers)) {
        server.postMessage({
          type: 'callForVote',
          payload: {
            peerId: peerId,
            sourceId: id
          }
        })
      }
      break;
    default:
      break;
  }
};

const handlePeerMessage = (message: IMessage<{
  peerId: string,
  message: {
    action: 'get' | 'set',
    data: any
  }
}>): IMessage => {

  switch (message.payload.message.action) {
    case 'get':
      return {
        type: "getResponse",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.payload.peerId,
          data: {
            key: message.payload.message.data.key,
            value: store[message.payload.message.data.key],
          }
        },
      };
      break;
    case 'set':
      store[message.payload.message.data.key] = message.payload.message.data.value;
      return {
        type: "setResponse",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.payload.peerId,
          data: {
            key: message.payload.message.data.key,
            value: store[message.payload.message.data.key],
            commited: true,
          }
        },
      };
    default:
      return {
        type: 'baddPeerMessageType',
        source: "main",
        destination: "server",
        payload: {
          message: 'peerMessageType ' + message.type + ' is invalid'
        }
      }
  }
}

// Messages logic with peers
const handleMessage = (message: IMessage<any>): IMessage => {
  switch (message.type) {
    case "heartbeat":
      clearTimeout(electionTimeoutId);
      transitionFunction("follower");
    case "newPeerMessage":
      return handlePeerMessage(message)
    case "set":
      return handlePeerMessage(message);
    case "newConnection":
      peers[message.payload.peerId] = {
        peerId: message.payload.peerId
      }
      return {
        type: "connectionAccepted",
        source: "main",
        destination: "server",
        payload: {
          peerId: message.payload.peerId,
        },
      };
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
  transitionFunction("leader");
} else {
  const sock = await connectWebSocket("ws://127.0.0.1:8080");

  await sock.send(JSON.stringify({
    type: "set",
    data: {
      key: "peerId",
      value: id,
    },
  }));

  for await (const msg of sock) {
    if (typeof msg == "string") {
      console.log(JSON.parse(msg));
    }
  }
}
