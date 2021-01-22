import Observe from "https://deno.land/x/Observe/Observe.ts";
import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import type { IKeyValue, ILog, IMessage, IWal } from "./interface.ts";
import Net from "./net.ts";
import Store from "./store.ts";
import Logger from "./logger.ts";
import Discovery from "./discovery.ts";

export type TState = "leader" | "follower" | "candidate" | "starting";

export default class Node {
  private args: Args = parse(Deno.args);

  private run = true;
  private uiRefreshTimeout: number = this.args["ui"] ? this.args["ui"] : 100;

  private messages: Observe<IMessage>;
  private leader = "";
  private requests: { [key: string]: string } = {};

  private net: Net;
  private store: Store;
  private logger: Logger;
  private state: TState = "starting";
  private discovery: Discovery;

  private term = 0;
  private votesCounter = 0;
  private heartBeatCounter = 1;
  private heartBeatInterval: number = this.args["hbi"] ? this.args["hbi"] : 30;
  private heartBeatIntervalId: number | undefined;
  private electionTimeout: number = this.args["etimeout"] ? this.args["etimeout"] : (Math.random() + 0.150) * 1000;
  private electionTimeoutId: number | undefined;
  
  private discoveryBeaconIntervalId: number | undefined;

  constructor() {
    this.messages = new Observe<IMessage>({
      type: "initialMessage",
      source: "node",
      destination: "log",
      payload: {},
    });

    // Register logger first since messages.bind() is called in the subscription order
    this.logger = new Logger(this.messages, this.args);

    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "node") {
        if (Object.keys(this.net.clients).includes(message.source)) {
          this.handleClientMessage(message);
        } else if (message.source == "ui") {
          this.handleUiMessage(message);
        } else {
          this.handleMessage(message);
        }
      }
    });

    this.net = new Net(this.messages);
    this.store = new Store(this.messages);
    this.discovery = new Discovery(this.messages);
    
    this.discovery.protocol = typeof this.args["discovery"] === "string" ? this.args["discovery"] : Discovery.DEFAULT;

    setInterval(() => {
      this.logger.ui({
        run: this.run,
        state: this.state,
        peers: Object.keys(this.net.peers),
        electionTimeout: this.electionTimeout,
        term: this.term,
        store: {
          store: this.store.store,
        },
        heartBeatCounter: this.heartBeatCounter,
      });
    }, this.uiRefreshTimeout);
  }

  private transitionFunction(to: TState) {
    const oldState: TState = this.state;

    clearTimeout(this.electionTimeoutId);
    clearInterval(this.heartBeatIntervalId);
    clearInterval(this.discoveryBeaconIntervalId);

    this.store.reset();

    switch (to) {
      case "starting":
        break;
      case "follower":
        this.electionTimeoutId = setTimeout(() => {
          if (this.run) {
            this.transitionFunction("candidate");
          }
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
          if (this.run) {
            for (const peerIp of Object.keys(this.net.peers)) {
              this.messages.setValue({
                type: "heartBeat",
                source: "node",
                destination: peerIp,
                payload: {
                  wal: this.store.buffer,
                  heartBeatCounter: this.heartBeatCounter,
                },
              });
              this.heartBeatCounter += 1;
            }
          }
        }, this.heartBeatInterval);

        this.discoveryBeaconIntervalId = setInterval(() => {
          if (this.run) {
            this.messages.setValue({
              type: "sendDiscoveryBeacon",
              source: "node",
              destination: "discovery",
              payload: {},
            });
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

        for (const peerIp of Object.keys(this.net.peers)) {
          this.messages.setValue({
            type: "newTerm",
            source: "node",
            destination: peerIp,
            payload: {
              term: this.term,
            },
          });
          this.heartBeatCounter += 1;
        }

        break;
      case "candidate":
        this.state = "candidate";
        this.votesCounter = 1;
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
          for (const peerIp of Object.keys(this.net.peers)) {
            this.messages.setValue({
              type: "callForVoteRequest",
              source: "node",
              destination: peerIp,
              payload: {
                term: this.term,
                peerIp: peerIp,
              },
            });
          }
        }

        break;
      default:
        this.messages.setValue({
          type: "invalidTransitionToState",
          source: "node",
          destination: "log",
          payload: {
            currentState: this.state,
            transitionTo: to
          }
        });
    }
  }

  private handleUiMessage(message: IMessage<{
    state: TState
  }>) {
    switch (message.type) {
      case "setState":
        this.transitionFunction(message.payload.state);
        break;
      case "runStop":
        this.run = !this.run;
        break;
      case "clearStore":
        this.store.empty();
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

  private handleClientMessage(message: IMessage<{
    key: string,
    value: string
  }>) {
    switch (message.type) {
      case "clearStore":
        this.store.empty();
        break;
      case "KVOpRequest":
        if (this.state == "leader") {
          // Later we'll need to verify the kv is not in process
          // Otherwise, the request will have to be delayed or rejected (or use MVCC)
          const log = this.store.set(message.payload.key, message.payload.value);

          this.requests[log.timestamp + log.action + log.next.key] =
            message.source;

          this.messages.setValue({
            type: "KVOpAccepted",
            source: "node",
            destination: "node",
            payload: {
              log: log,
            },
          });
        } else {
          this.messages.setValue({
            type: "KVOpReceivedButNotLeader",
            source: "node",
            destination: message.source,
            payload: {
              request: {
                key: message.payload.key,
                value: message.payload.value,
              },
              leader: this.leader
            },
          });
        }
        break;
      default:
        this.messages.setValue({
          type: "invalidClientMessageType",
          source: "node",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
    }
  }

  private handleMessage(message: IMessage<{
    wal: IWal,
    log: ILog,
    addr: Deno.NetAddr,
    term: number,
    peerIp: string,
    voteGranted: boolean,
    knownPeers: { [key: string]: { peerIp: string } },
    clientIp: string
    success: boolean,
    result: string
  }>) {
    switch (message.type) {
      case "heartBeat": {
        if (this.state === "candidate" || this.state === "starting") {
          this.transitionFunction("follower");
          break;
        }

        this.leader = message.source;
        this.heartBeatCounter += 1;

        clearTimeout(this.electionTimeoutId);

        this.electionTimeoutId = setTimeout(() => {
          if (this.run) {
            this.transitionFunction("candidate");
          }
        }, this.electionTimeout);

        const report: {
          commited: ILog[];
          appended: ILog[];
        } = this.store.sync(message.payload.wal);

        // Commited logs are logged locally
        for (const log of report.commited) {
          this.messages.setValue({
            type: "commitedLog",
            source: "node",
            destination: "log",
            payload: {
              log: log,
            },
          });
        }

        // Appended logs are notified to the leader
        for (const log of report.appended) {
          this.messages.setValue({
            type: "KVOpAccepted",
            source: "node",
            destination: message.source,
            payload: {
              log: log,
            },
          });
        }
        break;
      }
      case "KVOpAccepted": {
        let log: ILog = message.payload.log;

        const votes: number = this.store.voteFor(log.next.key);

        if (votes === -1) { // Key is not currently under vote
          this.messages.setValue({
            type: "KVOpAcceptedReceivedButCommited",
            source: "node",
            destination: "log",
            payload: {
              log: log,
            },
          });
        } else if (votes >= this.net.quorum) {
          log = this.store.commit(log);

          this.messages.setValue({
            type: "KVOpRequestComplete",
            source: "node",
            destination: "node",
            payload: {
              log: log,
              votes: votes,
              qorum: this.net.quorum,
            },
          });
        } else {
          this.messages.setValue({
            type: "KVOpAcceptedReceived",
            source: "node",
            destination: "log",
            payload: {
              message: message,
              qorum: this.net.quorum,
              votes: votes,
            },
          });
        }
        break;
      }
      case "KVOpRequestComplete": {
        const l: ILog = message.payload.log;
        const key: string = l.timestamp + l.action + l.next.key;
        const client = this.requests[key];
        delete this.requests[key];
        this.messages.setValue({
          type: "KVOpResponse",
          source: "node",
          destination: client,
          payload: {
            log: l,
          },
        });
        break;
      }
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
            source: "node",
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
          source: "node",
          destination: message.source,
          payload: {
            voteGranted: this.state != "leader" &&
              message.payload.term >= this.term,
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
      case "peerConnectionAccepted":
        this.term = message.payload.term;

        if (message.payload.wal) {
          this.store.sync(message.payload.wal);
        }

        this.messages.setValue({
          type: "openPeerConnectionComplete",
          source: "node",
          destination: "net",
          payload: {
            peerIp: message.source,
          },
        });

        for (const peerIp of Object.keys(message.payload.knownPeers)) {
          if (!Object.keys(this.net.peers).includes(peerIp)) {
            this.messages.setValue({
              type: "openPeerConnectionRequest",
              source: "node",
              destination: "net",
              payload: {
                peerIp: peerIp,
              },
            });
          }
        }
        break;
      case "peerConnectionOpen": {
        // Duplicate known peers before adding the new one (it already knows itself...)
        const knownPeers = { ...this.net.peers };

        // newPeer can be received twice from same peer
        // That's because knownPeers are added in parallel
        // Hence, a peer can connect a second time because its first co didn't make it before
        // another peer replies with the same knownPeer.
        // Duplicate conn are not a problem but duplicate newPeers will
        // send the peer to itself, thus making it create a self-loop
        delete knownPeers[message.payload.peerIp];

        this.messages.setValue({
          type: "peerConnectionAccepted",
          source: "node",
          destination: message.payload.peerIp,
          payload: {
            term: this.term,
            knownPeers: knownPeers,
            wal: this.store.wal,
          },
        });
        break;
      }
      case "peerConnectionClose":
        this.messages.setValue({
          type: "peerConnectionClose",
          source: "node",
          destination: "log",
          payload: {
            peerIp: message.payload.peerIp,
          },
        });
        break;
      case "clientConnectionOpen":
        this.messages.setValue({
          type: "clientConnectionOpen",
          source: "node",
          destination: "log",
          payload: {
            clientIp: message.payload.clientIp,
          },
        });
        break;
      case "clientConnectionClose":
        this.messages.setValue({
          type: "clientConnectionClose",
          source: "node",
          destination: "log",
          payload: {
            clientIp: message.payload.clientIp,
          },
        });
        break;
      case "peerServerStarted":
      case "discoveryServerStarted":
        if (this.net.ready && this.discovery.ready) {
          this.discovery.discover();
        }
        break;
      case "discoveryResult":
        if (message.payload.success) {
          this.messages.setValue({
            type: "openPeerConnectionRequest",
            source: "node",
            destination: "net",
            payload: {
              peerIp: message.payload.result
            }
          })
          this.messages.setValue({
            type: "nodeReady",
            source: "node",
            destination: "net.worker",
            payload: {
              ready: true
            }
          })
        } else {
          this.messages.setValue({
            type: "nodeReady",
            source: "node",
            destination: "net.worker",
            payload: {
              ready: true
            }
          })
        }
        this.transitionFunction("follower");
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
}
