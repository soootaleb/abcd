import { IMessage } from "ddapps/interface.ts";
import { EMType, IMPayload } from "ddapps/messages.ts";
import { IClientRequest } from "ddapps/operation.ts";
import { DRemotePeer } from "ddapps/models/remotepeer.model.ts";
import { ENodeState } from "./enumeration.ts";
import { IEntry, IKeyValue } from "./interface.ts";
import {
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";
import { TWal } from "./type.ts";

export enum EKVMType {
  // Store

  StoreInit = "StoreInit",
  StoreSyncRequest = "StoreSyncRequest",
  StoreSyncComplete = "StoreSyncComplete",
  StoreLogCommitFail = "StoreLogCommitFail",
  StoreLogCommitRequest = "StoreLogCommitRequest",
  StoreLogCommitSuccess = "StoreLogCommitSuccess",

  HeartBeat = "HeartBeat",
  AppendEntry = "AppendEntry",

  NewState = "NewState",
  NewTerm = "NewTerm",

  CallForVoteRequest = "CallForVoteRequest",
  CallForVoteResponse = "CallForVoteResponse",
  NewTermAccepted = "NewTermAccepted",
  NewTermRejected = "NewTermRejected",
  VoteReceivedButNotCandidate = "VoteReceivedButNotCandidate",

  // KVOPERATIONS
  KVOpRequest = "KVOpRequest",
  KVOpAccepted = "KVOpAccepted",
  KVOpRejected = "KVOpRejected",
  KVWatchRequest = "KVWatchRequest",
  KVOpAcceptedReceivedButCommited = "KVOpAcceptedReceivedButCommited",
  KVOpRequestComplete = "KVOpRequestComplete",
  KVOpRequestIncomplete = "KVOpRequestIncomplete",

  InvalidTransitionToState = "InvalidTransitionToState",
}

export interface IKVMPayload<
  ReqPayload extends IKVRequestPayload = IKVRequestPayload,
  ResPayload extends IKVResponsePayload = IKVResponsePayload,
> extends IMPayload<ReqPayload, ResPayload> {
  [EKVMType.StoreInit]: {
    [key: string]: IKeyValue;
  };

  [EKVMType.HeartBeat]: null;

  [EKVMType.AppendEntry]: IEntry;

  [EKVMType.NewState]: {
    from: ENodeState;
    to: ENodeState;
    reason: string;
  };

  [EKVMType.NewTerm]: {
    term: number;
  };

  [EKVMType.NewTermAccepted]: {
    term: number;
    leader: DRemotePeer<ReqPayload, ResPayload, IKVMPayload<ReqPayload, ResPayload>>;
  };

  [EKVMType.NewTermRejected]: {
    term: number;
  };

  [EKVMType.StoreLogCommitFail]: IEntry;
  [EKVMType.StoreLogCommitRequest]: IEntry;
  [EKVMType.StoreLogCommitSuccess]: IEntry[];

  [EKVMType.CallForVoteRequest]: {
    term: number;
  };

  [EKVMType.CallForVoteResponse]: {
    voteGranted: boolean;
  };

  [EKVMType.VoteReceivedButNotCandidate]: {
    callForVoteReply: IMessage<
      EKVMType.CallForVoteResponse,
      IKVRequestPayload,
      IKVResponsePayload,
      IKVMPayload
    >;
    currentState: ENodeState;
  };

  [EKVMType.KVOpAccepted]: IEntry;

  [EKVMType.KVOpRejected]: {
    reason: string;
    request: IClientRequest<IKVRequestPayload, keyof IKVRequestPayload>;
  };

  [EKVMType.StoreSyncRequest]: TWal;

  [EKVMType.StoreSyncComplete]: {
    report: {
      commited: IEntry[];
      appended: IEntry[];
    };
  };

  [EKVMType.KVOpRequest]: IClientRequest<IKVRequestPayload, keyof IKVRequestPayload>;

  [EKVMType.KVWatchRequest]: IClientRequest<IKVRequestPayload, keyof IKVRequestPayload>;

  [EKVMType.KVOpAcceptedReceivedButCommited]: IEntry;

  [EKVMType.KVOpRequestComplete]: IEntry;

  [EKVMType.KVOpRequestIncomplete]: IEntry;

  [EKVMType.InvalidTransitionToState]: {
    currentState: ENodeState;
    transitionTo: ENodeState;
  };

  [EMType.PeerConnectionAccepted]: {
    term: number;
    knownPeers: string[];
    wal: TWal;
  };
}