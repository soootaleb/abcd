import { parse } from "https://deno.land/std/flags/mod.ts";
import { ENodeState } from "./enumeration.ts";
import { EMType } from "./enumeration.ts";
import { IState } from "./interfaces/interface.ts";
import Store from "./store.ts";

const ARGS = parse(Deno.args)

const dataDir = typeof ARGS["data-dir"] === "string"
  ? ARGS["data-dir"]
  : Store.DEFAULT_DATA_DIR

export const state: IState = {
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
  },

  mon: {
    requests: [],
    stats: {},
    watchers: {},
    loggers: [],
  }
}