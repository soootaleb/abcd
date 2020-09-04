import * as c from "https://deno.land/std/fmt/colors.ts";
import { IMessage } from "./interface.ts";

type TState = "leader" | "follower" | "candidate";

// Variables
let port: string = Deno.args[0] == "8080" ? "8080" : "0";
let peers: { [key: string]: { peerPort: string } } = {};

let state: TState = "follower";
// let store: { [key: string]: any } = {};

let term: number = 0;
let votesCounter: number = 0;
let heartBeatCounter: number = 1;
let heartBeatInterval: number = 100;
let heartBeatIntervalId: number;
let electionTimeout: number = (Math.random() + 0.125) * 1000;
let electionTimeoutId: number;

// Initialisation
const transitionFunction = (to: TState) => {
  switch (to) {
    case "follower":
      console.log(
        c.bgBrightBlue(
          c.brightYellow(c.bold(`----- BECOMING FOLLOWER ${port} ----`)),
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
          c.brightYellow(c.bold(`----- BECOMING LEADER ${port} ----`)),
        ),
      );

      if (state == "leader") {
        // This avoid a leader to send newTerm multiple times to each node
        // Hence duplicating the execution of transitionFunction("follower")
        // etc
        // [TODO] This may be better handled (it's already idempotent but it may be good to not duplicate)
        break;
      }

      if (electionTimeoutId) {
        clearTimeout(electionTimeoutId);
      }

      heartBeatIntervalId = setInterval(() => {
        for (const peerPort of Object.keys(peers)) {
          net.postMessage({
            type: "heartBeat",
            source: port,
            destination: peerPort,
            payload: {
              heartBeatCounter: heartBeatCounter,
            },
          });
          heartBeatCounter += 1;
        }
      }, heartBeatInterval);

      term += 1;
      state = "leader";

      for (const peerPort of Object.keys(peers)) {
        net.postMessage({
          type: "newTerm",
          source: port,
          destination: peerPort,
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
          c.brightYellow(c.bold(`----- BECOMING CANDIDATE ${port} ----`)),
        ),
      );
      if (Object.keys(peers).length == 0) {
        transitionFunction("leader");
      }
      for (const peerPort of Object.keys(peers)) {
        net.postMessage({
          type: "callForVoteRequest",
          source: port,
          destination: peerPort,
          payload: {
            peerPort: peerPort,
            sourcePort: port,
          },
        });
      }

      state = "candidate";

      break;
    default:
      throw new Error(`Invalid transitionTo("${to}")`);
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
          peerPort: message.payload.peerPort,
        },
      };
    case "newTerm":
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
        source: port,
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
      peers[message.source] = message.payload.connectedTo;

      for (const peerPort of Object.keys(message.payload.knownPeers)) {
        if (!Object.keys(peers).includes(peerPort)) {
          net.postMessage({
            type: "connectToPeer",
            source: "main",
            destination: "net",
            payload: {
              peerPort: peerPort,
            },
          });
        }
      }

      return {
        type: "peerConnectionComplete",
        source: "main",
        destination: "main",
        payload: message.payload.connectedTo,
      };
    case "newConnection":
      // Duplicate known peers before adding the new one (it already knows itself...)
      const knownPeers = { ...peers };

      // newConnection can be received twice from same peer
      // That's because knownPeers are added in parallel
      // Hence, a peer can connect a second time because its first co didn't make it before
      // another peer replies with the same knownPeer.
      // Duplicate conn are not a problem but duplicate newConnections will
      // send the peer to itself, thus making it create a self-loop
      delete knownPeers[message.payload.peerPort];

      // Then we add the new peer
      peers[message.payload.peerPort] = {
        peerPort: message.payload.peerPort,
      };

      return {
        type: "connectionAccepted",
        source: port, //state == "leader" ? port : "main",
        destination: message.payload.peerPort, // state == "leader" ? message.payload.peerPort : "main",
        payload: {
          term: term,
          connectedTo: {
            peerPort: port,
          },
          knownPeers: knownPeers, // And we send back all other peers than itself
        },
      };
    case "peerConnectionLost":
      return {
        type: "removePeer",
        source: "main",
        destination: "net",
        payload: {
          peerPort: message.payload.peerPort,
        },
      };
    case "removePeerSuccess":
      delete peers[message.payload.peerPort];
      return {
        type: "removePeerComplete",
        source: "main",
        destination: "main",
        payload: {
          peerPort: message.payload.peerPort,
        },
      };
    case "registerPeerSuccess":
      return {
        type: "connectToPeerComplete",
        source: "main",
        destination: "main",
        payload: {
          peer: message.payload,
        },
      };
    case "serverStarted":
      port = message.payload.port.toString();
      return {
        type: "serverPortSetSuccess",
        source: "main",
        destination: "main",
        payload: {
          message: "serverStarted",
          server: message.payload,
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
  transitionFunction("follower");
  net.postMessage({
    type: "connectToPeer",
    source: "main",
    destination: "net",
    payload: {
      peerPort: Deno.args[0] ? Deno.args[0] : "8080",
    },
  });
}
