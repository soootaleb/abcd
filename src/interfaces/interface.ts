import { EComponent, EKVOpType, EMonOpType, EMType, EOpType } from "../enumeration.ts";
import { IMPayload } from "./mpayload.ts";

export interface IMessage<T extends EMType> {
  type: T,
  source: string,
  destination: EComponent | string,
  payload: IMPayload[T]
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