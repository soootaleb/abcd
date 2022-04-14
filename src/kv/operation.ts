import { IClientRequest, IRequestPayload, IResponsePayload } from "ddapps/operation.ts";
import { IKeyValue, IKVOp, IKVWatch, ILog } from "./interface.ts";

export enum EKVOpType {
  KVPut = "KVPut",
  KVGet = "KVGet",
  KVReject = "KVReject",
  KVWatch = "KVWatch",
}

export interface IKVRequestPayload extends IRequestPayload {
  [EKVOpType.KVPut]: IKeyValue;
  [EKVOpType.KVGet]: string;
  [EKVOpType.KVWatch]: IKVWatch;
  [EKVOpType.KVReject]: null
}

export interface IKVResponsePayload extends IResponsePayload {
  [EKVOpType.KVPut]: IKVOp;
  [EKVOpType.KVGet]: IKVOp;
  [EKVOpType.KVWatch]: ILog;
  [EKVOpType.KVReject]: IClientRequest<IKVRequestPayload, keyof IKVRequestPayload>;
}