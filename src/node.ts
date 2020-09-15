import * as c from "https://deno.land/std/fmt/colors.ts";
import Observe from "https://deno.land/x/Observe@v1.2.1/Observe.ts";
import { IMessage } from "./interface.ts";
import Net from "./net.ts";

export type TState = "leader" | "follower" | "candidate";

export default class Node {
  private net: Net;
  private messages: Observe<IMessage>;

  private state: TState = "follower";
  // private store: { [key: string]: any } = {};

  private term: number = 0;
  private votesCounter: number = 0;
  private heartBeatCounter: number = 1;
  private heartBeatInterval: number = 100;
  private heartBeatIntervalId: number = 0;
  private electionTimeout: number = (Math.random() + 0.125) * 1000;
  private electionTimeoutId: number = 0;

  constructor() {
    this.messages = new Observe<IMessage>({
      type: "initialMessage",
      source: "node",
      destination: "log",
      payload: {},
    });

    this.messages.bind((message: IMessage<any>) => {
      this.log(message);
      if (
        message.destination == "main" || message.destination == this.net.port
      ) {
        this.handleMessage(message);
      }
    });

    this.net = new Net(this.messages);
  }

  private transitionFunction(to: TState) {
    switch (to) {
      case "follower":
        console.log(
          c.bgBrightBlue(
            c.brightYellow(
              c.bold(`----- BECOMING FOLLOWER ${this.net.port} ----`),
            ),
          ),
        );
        if (this.heartBeatIntervalId) {
          clearInterval(this.heartBeatIntervalId);
        }
        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction("candidate");
        }, this.electionTimeout);

        this.state = "follower";

        break;
      case "leader":
        console.log(
          c.bgBrightBlue(
            c.brightYellow(
              c.bold(`----- BECOMING LEADER ${this.net.port} ----`),
            ),
          ),
        );

        if (this.state == "leader") {
          // This avoid a leader to send newTerm multiple times to each node
          // Hence duplicating the execution of transitionFunction("follower")
          // etc
          // [TODO] This may be better handled (it's already idempotent but it may be good to not duplicate)
          break;
        }

        if (this.electionTimeoutId) {
          clearTimeout(this.electionTimeoutId);
        }

        this.heartBeatIntervalId = setInterval(() => {
          for (const peerPort of Object.keys(this.net.peers)) {
            this.messages.setValue({
              type: "heartBeat",
              source: this.net.port,
              destination: peerPort,
              payload: {
                heartBeatCounter: this.heartBeatCounter,
              },
            });
            this.heartBeatCounter += 1;
          }
        }, this.heartBeatInterval);

        this.term += 1;
        this.state = "leader";

        for (const peerPort of Object.keys(this.net.peers)) {
          this.messages.setValue({
            type: "newTerm",
            source: this.net.port,
            destination: peerPort,
            payload: {
              term: this.term,
            },
          });
          this.heartBeatCounter += 1;
        }

        break;
      case "candidate":
        console.log(
          c.bgBrightBlue(
            c.brightYellow(
              c.bold(`----- BECOMING CANDIDATE ${this.net.port} ----`),
            ),
          ),
        );
        if (Object.keys(this.net.peers).length == 0) {
          this.transitionFunction("leader");
        }
        for (const peerPort of Object.keys(this.net.peers)) {
          this.messages.setValue({
            type: "callForVoteRequest",
            source: this.net.port,
            destination: peerPort,
            payload: {
              peerPort: peerPort,
              sourcePort: this.net.port,
            },
          });
        }

        this.state = "candidate";

        break;
      default:
        throw new Error(`Invalid transitionTo("${to}")`);
    }
  }

  private handleMessage(message: IMessage<any>) {
    switch (message.type) {
      case "heartBeat":
        if (this.electionTimeoutId) {
          clearTimeout(this.electionTimeoutId);
        }
        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction("candidate");
        }, this.electionTimeout);
        break;
      case "newTerm":
        this.term = message.payload.term;

        if (this.electionTimeoutId) {
          clearTimeout(this.electionTimeoutId);
          this.transitionFunction("follower");
        }

        this.messages.setValue({
          type: "newTermAccepted",
          source: "node",
          destination: "log",
          payload: {
            term: this.term,
            leader: this.net.peers[message.source],
          },
        });
        break;
      case "callForVoteRequest":
        this.messages.setValue({
          type: "callForVoteReply",
          source: this.net.port,
          destination: message.source,
          payload: {
            voteGranted: true,
          },
        });
        break;
      case "callForVoteReply":
        if (message.payload.voteGranted) {
          this.votesCounter += 1;
        }

        if (
          this.votesCounter + 1 > (Object.keys(this.net.peers).length + 1) / 2
        ) {
          this.votesCounter = 0;
          this.transitionFunction("leader");
        }

        this.messages.setValue({
          type: "becameLeader",
          source: "node",
          destination: "log",
          payload: {},
        });
        break;
      case "connectionAccepted":
        this.term = message.payload.term;
        this.messages.setValue({
          type: "peerConnectionComplete",
          source: "node",
          destination: "net",
          payload: {
            connectedTo: message.payload.connectedTo
          },
        });

        for (const peerPort of Object.keys(message.payload.knownPeers)) {
          if (!Object.keys(this.net.peers).includes(peerPort)) {
            this.messages.setValue({
              type: "connectToPeer",
              source: "node",
              destination: "net",
              payload: {
                peerPort: peerPort,
              },
            });
          }
        }
        break;
      case "newConnection":
        // Duplicate known peers before adding the new one (it already knows itself...)
        const knownPeers = { ...this.net.peers };

        // newConnection can be received twice from same peer
        // That's because knownPeers are added in parallel
        // Hence, a peer can connect a second time because its first co didn't make it before
        // another peer replies with the same knownPeer.
        // Duplicate conn are not a problem but duplicate newConnections will
        // send the peer to itself, thus making it create a self-loop
        delete knownPeers[message.payload.peerPort];

        this.messages.setValue({
          type: "connectionAccepted",
          source: this.net.port,
          destination: message.payload.peerPort,
          payload: {
            term: this.term,
            connectedTo: {
              peerPort: this.net.port,
            },
            knownPeers: knownPeers,
          },
        });
        break;
      case "peerConnectionLost":
        this.messages.setValue({
          type: "peerConnectionLost",
          source: "node",
          destination: "log",
          payload: {
            peerPort: message.payload.peerPort,
          },
        });
        break;
      case "serverStarted":
        this.transitionFunction("follower");
        if (message.payload.port != "8080") {
          this.messages.setValue({
            type: "connectToPeer",
            source: this.net.port,
            destination: "net",
            payload: {
              peerPort: Deno.args[0] ? Deno.args[0] : "8080"
            }
          })
        }
        break;
      default:
        this.messages.setValue({
          type: "invalidMessageType",
          source: "node",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
    }
  }

  private log(message: IMessage) {
    if (message.destination != "ui") {
      this.messages.setValue({
        ...message,
        destination: "ui"
      })
    }

    if (message.type != "heartBeat") {
      console.log(
        c.bgWhite(
          "                                                                                   ",
        ),
      );
      if (message.type == "serverStarted") {
        console.log(
          c.bgBrightMagenta(
            c.brightYellow(
              c.bold(
                `[${message.source}]->[${message.destination}][${message.type}]${
                  JSON.stringify(message.payload)
                }`,
              ),
            ),
          ),
        );
      } else {
        console.log(
          c.gray(
            `[${message.source}]->[${message.destination}][${message.type}]${
              JSON.stringify(message.payload)
            }`,
          ),
        );
      }
    }
  }
}
