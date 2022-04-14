import { IState } from "ddapps/interface.ts";
import { ENodeState } from "./enumeration.ts";
import { IKVMPayload } from "./messages.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";
import { TWal } from "./type.ts";

export interface IKVState<
  ReqPayload extends IKVRequestPayload = IKVRequestPayload,
  ResPayload extends IKVResponsePayload = IKVResponsePayload,
  MPayload extends IKVMPayload<ReqPayload, ResPayload> = IKVMPayload<
    ReqPayload,
    ResPayload
  >,
> extends
  IState<
    ReqPayload,
    ResPayload,
    MPayload
  > {
  leader: string;
  role: ENodeState;
  term: number;
  voteGrantedDuringTerm: boolean;
  votesCounter: number;
  heartBeatInterval: number;
  heartBeatIntervalId: number | undefined;
  electionTimeout: number;
  electionTimeoutId: number | undefined;

  store: {
    dataDir: string;
    wal: TWal;
    votes: { [key: string]: number };
    store: { [key: string]: IKeyValue };
    fwal: Deno.FsFile;
    encoder: TextEncoder;
    watchers: {
      [key: string]: { // key to watch
        [key: string]: { // watcher token
          expire: number
        }
      }
    };
    bwal: IEntry[];
  };
}

export interface IKeyValue<T = string | number> {
  key: string;
  value?: T;
}

export interface ILog<T = string | number> {
  op: EKVOpType;
  commited: boolean;
  timestamp: number;
  previous?: IKeyValue<T>;
  next: IKeyValue<T>;
}

export interface IEntry {
  log: ILog;
  token: string;
}

export interface IReport {
  commited: IEntry[];
  appended: IEntry[];
}

export interface IKVOp {
  kv: IKeyValue;
  op: EKVOpType;
}

export interface IKVWatch {
  key: string;
  expire: number; // limit of notifies
}
