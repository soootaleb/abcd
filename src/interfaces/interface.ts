import { EComponent, EKVOpType, EMonOpType, EMType, ENodeState, EOpType } from "../enumeration.ts";
import { TWal } from "../type.ts";
import { IMPayload } from "./mpayload.ts";

export interface IMessage<T extends EMType> {
  type: T,
  source: string,
  destination: EComponent | string,
  payload: IMPayload[T]
}

export interface IState {
  leader: string
  role: ENodeState
  term: number
  ready: boolean,
  voteGrantedDuringTerm: boolean
  votesCounter: number,
  heartBeatInterval: number,
  heartBeatIntervalId: number | undefined
  electionTimeout: number
  electionTimeoutId: number | undefined
  
  net: {
    requests: { [key: string]: string }
    ready: boolean,
    peers: {
      [key: string]: {
        peerIp: string
      }
    },
    clients: {
      [key: string]: {
        clientIp: string,
        remoteAddr: Deno.NetAddr,
        clientId: number
      }
    }
  }

  store: {
    dataDir: string;
    wal: TWal;
    votes: { [key: string]: number };
    store: { [key: string]: IKeyValue };
    fwal: Deno.File;
    encoder: TextEncoder;
    watchers: { [key: string]: string[] }
    bwal: IEntry[];
  }

  log: {
    console: boolean,
    exclude: EMType[],
    last: number
  }

  mon: {
    requests: string[],
    stats: { [key: string]: number },
    watchers: { [key: string]: number },
    loggers: string[]
  }
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
  log: ILog,
  token: string
}

export interface IReport {
  commited: IEntry[],
  appended: IEntry[]
}

export interface IKVOp {
  kv: IKeyValue,
  op: EKVOpType
}

export interface IKVWatch {
  key: string,
  expire: number // limit of notifies
}

export interface IMonOp {
  op: EMonOpType,
  metric: IKeyValue
}

export interface IMonWatch {
  key: string,
  expire: number // limit of notifies
}

export interface IOPayload {
  [EOpType.KVOp]: IKVOp,
  [EOpType.KVWatch]: IKVWatch,
  [EOpType.MonOp]: IMonOp,
  [EOpType.MonWatch]: IMonWatch
}