import { parse } from "std/flags/mod.ts";
import { IKVState } from "./interface.ts";
import { of } from "ddapps/state.ts";
import { ENodeState } from "./enumeration.ts";
import { Store } from "./store.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import { IKVRequestPayload, IKVResponsePayload } from "./operation.ts";

const ARGS = parse(Deno.args);
const state = of<IKVRequestPayload, IKVResponsePayload, IKVMPayload>()

const dataDir = typeof ARGS["data-dir"] === "string"
  ? ARGS["data-dir"]
  : Store.DEFAULT_DATA_DIR;

export const kvstate: IKVState = {
  ...state,

  leader: "",
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

  log: {
    ...state.log,
    exclude: [
      ...state.log.exclude,
      EKVMType.HeartBeat,
    ],
  },
};
