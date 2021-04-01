import Logger from "./src/logger.ts";
import Node from "./src/node.ts";
import { ENodeState, EMType } from "./src/enumeration.ts"
import { parse } from "https://deno.land/std/flags/mod.ts";
import { IState } from "./src/interfaces/interface.ts";
import Discovery from "./src/discovery.ts";
import Net from "./src/net.ts";
import Store from "./src/store.ts";
import Api from "./src/api.ts";
import Monitor from "./src/monitor.ts";

console.table(Deno.version);

const ARGS = parse(Deno.args)

const dataDir = typeof ARGS["data-dir"] === "string"
  ? ARGS["data-dir"]
  : Store.DEFAULT_DATA_DIR

const state: IState = {
  leader: "",
  requests: {},
  role: ENodeState.Starting,
  term: 0,
  voteGrantedDuringTerm: false,
  votesCounter: 0,
  heartBeatInterval: ARGS["hbi"] ? ARGS["hbi"] : 50,
  electionTimeout: ARGS["etimeout"]
    ? ARGS["etimeout"] + Math.random() * 1000
    : (Math.random() + 0.300) * 1000,
  heartBeatIntervalId: undefined,
  electionTimeoutId: undefined,
  discoveryBeaconTimeoutId: undefined,
  discoveryBeaconIntervalId: undefined,

  net: {
    ready: false,
    peers: {},
    clients: {}
  },

  store: {
    dataDir: dataDir,
    wal: [],
    votes: {},
    store: {},
    fwal: Deno.openSync(
      dataDir + "/abcd.wal",
      { append: true, create: true },
    ),
    encoder: new TextEncoder(),
    watchers: {},
    bwal: [],
  },

  discovery: {
    ready: false,
    protocol: typeof ARGS["discovery"] === "string"
      ? ARGS["discovery"]
      : "udp"
  },

  log: {
    console: Boolean(ARGS["console-messages"]) || Boolean(ARGS["debug"]),
    exclude: [
      EMType.HeartBeat,
      EMType.StoreVotesReset,
      EMType.DiscoveryBeaconSend
    ]
  }
}

// Register Logger first so eventListener will print message before executing anything else
new Logger(state);
new Api(state);
new Monitor(state);
new Net(state);
new Store(state);
new Discovery(state);
new Node(state);

for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
  Deno.exit();
}