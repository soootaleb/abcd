import * as c from "https://deno.land/std/fmt/colors.ts";
import { IMessage } from "./interface.ts";

type TState = "leader" | "follower" | "candidate";

// Variables
const id: string = Math.random().toString(36).substring(2, 10) +
  Math.random().toString(36).substring(2, 10);
// let store: { [key: string]: any } = {};
let state: TState = "follower";
let heartBeatCounter: number = 1;
let heartBeatInterval: number = 100;
let electionTimeout: number = (Math.random() + 0.125) * 1000;
let peers: { [key: string]: { peerId: string; peerPort: string } } = {};
let electionTimeoutId: number;
let heartBeatIntervalId: number;
let votesCounter: number = 0;
let term: number = 0;
let leaderPort: number = parseInt(Deno.args[0]);

// Initialisation
const transitionFunction = (to: TState) => {
  switch (to) {
    case "follower":
      console.log(
        c.bgBrightBlue(
          c.brightYellow(c.bold(`----- BECOMING FOLLOWER ${id} ----`)),
        ),
      );
      if (heartBeatIntervalId) {
        clearInterval(heartBeatIntervalId);
      }
      electionTimeoutId = setTimeout(() => {
        transitionFunction("candidate");
      }, electionTimeout);
      state = "follower";
      break;
    case "leader":
      console.log(
        c.bgBrightBlue(
          c.brightYellow(c.bold(`----- BECOMING LEADER ${id} ----`)),
        ),
      );

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

      term += 1;
      state = "leader";

      for (const peerId of Object.keys(peers)) {
        net.postMessage({
          type: "newTerm",
          source: id,
          destination: peerId,
          payload: {
            term: term,
          },
        });
        heartBeatCounter += 1;
      }

      break;
    case "candidate":
      console.log(
        c.bgBrightBlue(
          c.brightYellow(c.bold(`----- BECOMING CANDIDATE ${id} ----`)),
        ),
      );
      if (Object.keys(peers).length == 0) {
        transitionFunction("leader");
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
      state = "candidate";
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
    case "newTerm":
      leaderPort = parseInt(peers[message.source].peerPort);
      term = message.payload.term;
      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
        transitionFunction("follower");
      }
      return {
        type: "newTermAccepted",
        source: "main",
        destination: "main",
        payload: {
          term: term,
          leader: peers[message.source],
        },
      };
    case "callForVoteRequest":
      return {
        type: "callForVoteReply",
        source: id,
        destination: message.source,
        payload: {
          voteGranted: true,
        },
      };
    case "callForVoteReply":
      if (message.payload.voteGranted) {
        votesCounter += 1;
      }

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
    case "connectionAccepted":
      term = message.payload.term;
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
        type: "connectionAccepted",
        source: state == "leader" ? id : "main",
        destination: state == "leader" ? message.payload.peerId : "main",
        payload: {
          term: term,
          knownPeers: knownPeers, // And we send back all other peers than itself
        },
      };
    case "idSetSuccess":
      const setId = message.payload.id;
      if (setId == id) {
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
          peerId: message.payload.peerId,
        },
      };
    default:
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
    console.log(
      c.bgWhite(
        "                                                                                   ",
      ),
    );
    if (e.data.source == "net") {
      if (e.data.type == "serverStarted") {
        console.log(
          c.bgBrightMagenta(
            c.brightYellow(
              c.bold(
                `[${e.data.source}]->[${e.data.destination}][${e.data.type}]${
                  JSON.stringify(e.data.payload)
                }`,
              ),
            ),
          ),
        );
      } else {
        console.log(
          c.gray(
            `[${e.data.source}]->[${e.data.destination}][${e.data.type}]${
              JSON.stringify(e.data.payload)
            }`,
          ),
        );
      }
    } else {
      console.log(c.red(e.data.source), e.data);
    }
    console.log(
      c.bgWhite(
        "                                                                                   ",
      ),
    );
  }
  const message = handleMessage(e.data);
  // [FIXME] Latter if we have other comps than NET, this dispatch will fail (need to make sure it's for net)
  if (message.destination !== "main") {
    net.postMessage(message);

    if (message.type != "heartBeat") {
      console.log(
        c.bgWhite(
          "                                                                                   ",
        ),
      );
      if (message.destination == "net") {
        console.log(
          c.gray(
            `[${message.source}]->[${message.destination}][${message.type}]${
              JSON.stringify(e.data.payload)
            }`,
          ),
        );
      } else {
        console.log(c.green(message.destination), message);
      }
      console.log(
        c.bgWhite(
          "                                                                                   ",
        ),
      );
    }
  } else {
    c.gray(
      `[${message.source}]->[${message.destination}][${message.type}]${
        JSON.stringify(message.payload)
      }`,
    );
  }
};

if (Deno.args[0] == "8080") {
  transitionFunction("leader");
} else {
  leaderPort = Deno.args[0] ? parseInt(Deno.args[0]) : 8080;
  transitionFunction("follower");
  net.postMessage({
    type: "addPeer",
    source: "main",
    destination: "net",
    payload: {
      peerPort: leaderPort,
    },
  });
}
