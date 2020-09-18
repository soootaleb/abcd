import * as c from "https://deno.land/std/fmt/colors.ts";
import Observe from "https://deno.land/x/Observe/Observe.ts";
import type { IKeyValue, IMessage } from "./interface.ts";
import Net from "./net.ts";

export type TState = "leader" | "follower" | "candidate";

export default class Node {
  private net: Net;
  private uiRefreshTimeout: number = 500;
  private messages: Observe<IMessage>;

  private state: TState = "follower";

  private term: number = 0;
  private votesCounter: number = 0;
  private heartBeatCounter: number = 1;
  private heartBeatInterval: number = 100;
  private heartBeatIntervalId: number | undefined;
  private electionTimeout: number = (Math.random() + 0.125) * 1000;
  private electionTimeoutId: number | undefined;

  /**
   * TODO Make pedding setKV requests uniq in store & heartBeat
   * Now get to make two delete actions on complete
   */
  private heartBeatMessage: {
    pendingSetKeyValueRequests: { [key: string]: IKeyValue };
    heartBeatCounter: number;
  } = {
    pendingSetKeyValueRequests: {},
    heartBeatCounter: this.heartBeatCounter,
  };

  private kvstore: { [key: string]: IKeyValue } = {};

  private kvstorecounter: {
    [key: string]: {
      kv: IKeyValue;
      votes: number;
    };
  } = {};

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
        message.source == "ui"
          ? this.handleUiMessage(message)
          : this.handleMessage(message);
      }
    });

    this.net = new Net(this.messages);

    setInterval(() => {
      this.messages.setValue({
        type: "uiStateUpdate",
        source: "node",
        destination: "log",
        payload: {
          port: this.net.port,
          state: this.state,
          peers: Object.keys(this.net.peers),
          electionTimeout: this.electionTimeout,
          term: this.term,
          heartBeatCounter: this.heartBeatCounter,
        },
      });
    }, this.uiRefreshTimeout);
  }

  private transitionFunction(to: TState) {
    const oldState: TState = this.state;

    clearTimeout(this.electionTimeoutId);
    clearInterval(this.heartBeatIntervalId);

    this.kvstorecounter = {};

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
            newState: this.state,
          },
        });

        break;
      case "leader":
        this.heartBeatIntervalId = setInterval(() => {
          for (const peerPort of Object.keys(this.net.peers)) {
            this.messages.setValue({
              type: "heartBeat",
              source: this.net.port,
              destination: peerPort,
              payload: this.heartBeatMessage,
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
            newState: this.state,
          },
        });

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
        this.votesCounter += 1;
        this.messages.setValue({
          type: "newState",
          source: "node",
          destination: "log",
          payload: {
            oldState: oldState,
            newState: this.state,
          },
        });

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

  private handleUiMessage(message: IMessage<any>) {
    switch (message.type) {
      case "setState":
        this.transitionFunction(message.payload.state);
        break;
      case "setKeyValueRequest":
        if (this.state == "leader") {
          // Later we'll need to verify the kv is not in process
          // Otherwise, the request will have to be delayed or rejected

          if (this.net.quorum == 1) {
            this.kvstore[message.payload.key] = {
              key: message.payload.key,
              value: message.payload.value,
            };

            // Always better clean
            delete this.kvstorecounter[message.payload.key];
            delete this.heartBeatMessage.pendingSetKeyValueRequests[message.payload.key];

            this.messages.setValue({
              type: "setKVRequestComplete",
              source: "node",
              destination: "log",
              payload: message.payload,
            });
          } else {
            // Initialise the store counter with value & reset vote at 1
            this.kvstorecounter[message.payload.key] = {
              kv: message.payload,
              votes: 1, // because the current node votes for itself
            };

            // Send the kv to sync at next heartbeat
            this.heartBeatMessage
              .pendingSetKeyValueRequests[message.payload.key] = {
                key: message.payload.key,
                value: message.payload.value,
              };
          }
        } else {
          this.messages.setValue({
            type: "setValueRequestReceivedButNotLeader",
            source: this.net.port,
            destination: "log",
            payload: {
              key: message.payload.key,
              value: message.payload.value,
            },
          });
        }
        break;
      default:
        this.messages.setValue({
          type: "invalidUiMessageType",
          source: "node",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
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

        for (
          const [key, kv] of Object.entries<IKeyValue>(
            message.payload.pendingSetKeyValueRequests,
          )
        ) {
          this.messages.setValue({
            type: "heartBeatContainsSetKV",
            source: "node",
            destination: "log",
            payload: message.payload
          })
          this.kvstore[key] = kv;
          this.messages.setValue({
            type: "setKVAccepted",
            source: this.net.port,
            destination: message.source,
            payload: kv,
          });
        }
        break;
      case "setKVAccepted":
        if (Object.keys(this.kvstorecounter).includes(message.payload.key)) {
          this.kvstorecounter[message.payload.key].votes += 1;
          if (
            this.kvstorecounter[message.payload.key].votes >= this.net.quorum
          ) {
            this.kvstore[message.payload.key] = {
              key: message.payload.key,
              value: message.payload.value,
            };

            delete this.kvstorecounter[message.payload.key];
            delete this.heartBeatMessage.pendingSetKeyValueRequests[message.payload.key];

            this.messages.setValue({
              type: "setKVRequestComplete",
              source: "node",
              destination: "log",
              payload: message.payload,
            });
          } else {
            this.messages.setValue({
              type: "setKVAcceptedReceived",
              source: "node",
              destination: "log",
              payload: this.kvstore[message.payload.key],
            });
          }
        } else {
          this.messages.setValue({
            type: "setKVAcceptedReceivedButCommited",
            source: "node",
            destination: "log",
            payload: message.payload,
          });
        }
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
              term: this.term,
            },
          });
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
            this.votesCounter >= this.net.quorum
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
              currentState: this.state,
            },
          });
        }
        break;
      case "connectionAccepted":
        this.term = message.payload.term;
        this.messages.setValue({
          type: "peerConnectionComplete",
          source: "node",
          destination: "net",
          payload: {
            connectedTo: message.payload.connectedTo,
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
            source: "node",
            destination: "net",
            payload: {
              peerPort: Deno.args[0] ? Deno.args[0] : "8080",
            },
          });
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
          message: message,
        },
      });
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
