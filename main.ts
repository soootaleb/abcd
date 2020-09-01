import { blue, green, red, yellow } from "https://deno.land/std/fmt/colors.ts";
import { IMessage } from "./interface.ts";

type TState = "leader" | "follower" | "candidate";

// Variables
const id: string = Math.random().toString(36).substring(2, 10) +
  Math.random().toString(36).substring(2, 10);
// let store: { [key: string]: any } = {};
let heartBeatCounter: number = 1;
let heartBeatInterval: number = 1000;
let electionTimeout: number = 2000;
let peers: { [key: string]: { peerId: string; peerPort: string } } = {};
let electionTimeoutId: number;
let heartBeatIntervalId: number;
let votesCounter: number = 0;

// Initialisation
const transitionFunction = async (to: TState) => {
  switch (to) {
    case "follower":
      console.log("[MAIN][BECOME FOLLOWER]");
      if (heartBeatIntervalId) {
        clearInterval(heartBeatIntervalId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);

      net.postMessage({
        type: "addPeer",
        source: "main",
        destination: "net",
        payload: {
          peerPort: Deno.args[0] ? Deno.args[0] : 8080,
        },
      });

      break;
    case "leader":
      console.log("[MAIN][BECOME LEADER]");
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      heartBeatIntervalId = setInterval(() => {
        for (const peerId of Object.keys(peers)) {
          net.postMessage({
            type: "heartBeat",
            source: id,
            destination: peerId,
            payload: {
              heartBeatCounter: heartBeatCounter,
            },
          });
          heartBeatCounter += 1;
        }
      }, heartBeatInterval);
      break;
    case "candidate":
      console.log("[MAIN][BECOME CANDIDATE]");
      if (Object.keys(peers).length == 0) {
        console.log(yellow("[MAIN] No peers... becoming leader"))
        transitionFunction("leader")
      }
      let votes: number = 0;
      for (const peerId of Object.keys(peers)) {
        net.postMessage({
          type: "callForVoteRequest",
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

// Messages logic with peers
const handleMessage = (message: IMessage<any>): IMessage => {
  switch (message.type) {
    case "heartBeat":
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      return {
        type: "heartBeatReceived",
        source: "main",
        destination: "main",
        payload: {
          peerId: message.payload.sourceId,
        },
      };
    case "callForVoteRequest":
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }
      return {
        type: "callForVoteReply",
        source: id,
        destination: message.source,
        payload: {
          voteGranted: true,
        },
      };
    case "callForVoteReply":
      console.log(blue("[MAIN] Received one vote from " + message.source));

      if (votesCounter + 1 > (Object.keys(peers).length + 1) / 2) {
        votesCounter = 0;
        transitionFunction("leader");
      }

      return {
        type: "becameLeader",
        source: "main",
        destination: "main",
        payload: {},
      };
    case "knownPeers":
      let addedPeers: { [key: string]: any } = {};
      for (const peerId of Object.keys(message.payload.knownPeers)) {
        if (!Object.keys(peers).includes(peerId)) {
          peers[peerId] = message.payload.knownPeers[peerId];
          addedPeers[peerId] = message.payload.knownPeers[peerId];
          net.postMessage({
            type: "addPeer",
            source: "main",
            destination: "net",
            payload: {
              peerId: peerId,
              peerPort: message.payload.knownPeers[peerId].peerPort,
            },
          });
        }
      }

      return {
        type: "peersAdded",
        source: "main",
        destination: "main",
        payload: {
          addedPeers: addedPeers,
        },
      };
    case "newConnection":
      // Duplicate known peers before adding the new one (it already knows itself...)
      const knownPeers = { ...peers };

      // Then we add the new peer
      peers[message.payload.peerId] = {
        peerId: message.payload.peerId,
        peerPort: message.payload.peerPort,
      };

      return {
        type: "knownPeers",
        source: id,
        destination: message.payload.peerId,
        payload: {
          knownPeers: knownPeers, // And we send back all other peers than itself
        },
      };
    case "idSetSuccess":
      const setId = message.payload.id;
      if (setId == id) {
        console.log(
          green(`[MAIN] Successfuly sync id ${blue(setId)} with net`),
        );
        return {
          type: "syncIdSuccess",
          source: "main",
          destination: "main",
          payload: {
            setId: setId,
            id: id,
          },
        };
      } else {
        console.error(red(`[MAIN] Net set bad id (${setId} instead of ${id}`));
        return {
          type: "syncIdFail",
          source: "main",
          destination: "main",
          payload: {
            setId: setId,
            id: id,
          },
        };
      }
      break;
    case "peerConnectionLost":
      return {
        type: "removePeer",
        source: "main",
        destination: "net",
        payload: {
          peerId: message.payload.peerId,
        },
      };
    case "peerRemovedSuccess":
      delete peers[message.payload.peerId];
      return {
        type: "peerRemovedComplete",
        source: "main",
        destination: "main",
        payload: {
          peerId: message.payload.peerId
        }
      }
    default:
      console.error(
        red(
          "[MAIN] Invalid message type " + message.type + " from " +
            message.source,
        ),
      );
      return {
        type: "invalidMessageType",
        source: "main",
        destination: "main",
        payload: {
          message: message,
        },
      };
  }
};

const net: Worker = new Worker(new URL("net.ts", import.meta.url).href, {
  type: "module",
  deno: true,
});

net.postMessage({
  type: "setNodeId",
  source: "main",
  destination: "net",
  payload: {
    id: id,
  },
});

net.onmessage = (e: MessageEvent) => {
  if (e.data.type != "heartBeat") {
    console.log("[MAIN] from [NET]", e.data);
  }
  const message = handleMessage(e.data);
  // [FIXME] Latter if we have other comps than NET, this dispatch will fail (need to make sure it's for net)
  if (message.destination !== "main") {
    net.postMessage(message);
  }
};

if (Deno.args[0] == "leader") {
  await transitionFunction("leader");
  console.log(blue(`[MAIN] Peer ${id} is now leader`));
} else {
  await transitionFunction("follower");
}
