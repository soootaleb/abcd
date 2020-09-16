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
  private heartBeatIntervalId: number | undefined;
  private electionTimeout: number = (Math.random() + 0.125) * 1000;
  private electionTimeoutId: number | undefined;

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
        message.destination == "node" || message.destination == this.net.port
      ) {
        this.handleMessage(message);
      }
    });

    this.net = new Net(this.messages);

    setInterval(() => {
      this.messages.setValue({
        type: "uiStateUpdate",
        source: "node",
        destination: "log",
        payload: {
          state: this.state,
          peers: Object.keys(this.net.peers),
          electionTimeout: this.electionTimeout,
          term: this.term,
          heartBeatCounter: this.heartBeatCounter
        }
      })
    }, 300)
  }

  private transitionFunction(to: TState) {
    const oldState: TState = this.state;

    clearTimeout(this.electionTimeoutId);
    clearInterval(this.heartBeatIntervalId);

    switch (to) {
      case "follower":
        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction("candidate");
        }, this.electionTimeout);

        this.state = "follower";
        this.messages.setValue({
          type: "newState",
          source: "node",
          destination: "log",
          payload: {
            oldState: oldState,
            newState: this.state
          }
        })

        break;
      case "leader":

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
        this.messages.setValue({
          type: "newState",
          source: "node",
          destination: "log",
          payload: {
            oldState: oldState,
            newState: this.state
          }
        })

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

        this.state = "candidate";
        this.messages.setValue({
          type: "newState",
          source: "node",
          destination: "log",
          payload: {
            oldState: oldState,
            newState: this.state
          }
        })

        if (Object.keys(this.net.peers).length == 0) {
          this.transitionFunction("leader");
        } else {
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
        }

        break;
      default:
        throw new Error(`Invalid transitionTo("${to}")`);
    }
  }

  private handleMessage(message: IMessage<any>) {
    switch (message.type) {
      case "heartBeat":

        this.heartBeatCounter += 1;

        clearTimeout(this.electionTimeoutId);

        this.electionTimeoutId = setTimeout(() => {
          this.transitionFunction("candidate");
        }, this.electionTimeout);
        break;
      case "newTerm":

        if (message.payload.term > this.term) {
          this.term = message.payload.term;
  
          this.messages.setValue({
            type: "newTermAccepted",
            source: "node",
            destination: "log",
            payload: {
              term: this.term,
              leader: this.net.peers[message.source],
            },
          });
  
          // TODO Implement WAL sync here

          this.transitionFunction("follower");

        } else {
          this.messages.setValue({
            type: "newTermRejected",
            source: this.net.port,
            destination: message.source,
            payload: {
              term: this.term
            }
          })
        }
        break;
      case "callForVoteRequest":
        this.messages.setValue({
          type: "callForVoteReply",
          source: this.net.port,
          destination: message.source,
          payload: {
            voteGranted: this.state != "leader",
          },
        });
        break;
      case "callForVoteReply":
        if (this.state == "candidate") {
          if (message.payload.voteGranted) {
            this.votesCounter += 1;
          }
  
          if (
            this.votesCounter + 1 > (Object.keys(this.net.peers).length + 1) / 2
          ) {
            this.votesCounter = 0;
            this.transitionFunction("leader");
          }
        } else {
          this.messages.setValue({
            type: "voteReceivedButNotCandidate",
            source: "node",
            destination: "log",
            payload: {
              callForVoteReply: message,
              currentState: this.state
            }
          })
        }
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
    if (message.destination != "ui" && message.type != "heartBeat") {
      /**
       * We wrap the messages for UI in another messages
       * - source is the current node sending the messages (so the UI can know it & deal with multiple nodes)
       * - destination is "ui" so there is no ambiguity for the network layer
       * - payload contains the log message we want to forward
       * 
       * This approach has been implemented because using messages with destination "ui"
       * in the application coupled the ui logging logic & created complexity
       * This way, the application has no messages with destination ui, only this log function
       */
      this.messages.setValue({
        type: "uiLogMessage",
        source: this.net.port,
        destination: "ui",
        payload: {
          message: message
        }
      })
    }

    if (!["heartBeat", "uiLogMessage"].includes(message.type)) {
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
