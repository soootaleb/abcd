import { IMPayload } from "ddapps/messages.ts";
import { Block } from "./block.ts";
import { ECOpType, ICRequestPayload, ICResponsePayload } from "./operation.ts";
import { Transaction } from "./transaction.ts";

// [OK] User defines a list of message types
export enum ECMType {
  ChainAddRequest = "ChainAddRequest",
  ChainGetRequest = "ChainGetRequest",
  ChainSumRequest = "ChainSumRequest",

  NewBlock = "NewBlock",
  NewTransaction = "NewTransaction"
}

// [OK] User defines the payload types
export interface ICMPayload extends IMPayload<ICRequestPayload, ICResponsePayload> {

  [ECMType.ChainAddRequest]: {
    token: string,
    type: ECOpType.TxAdd;
    timestamp: number,
    payload: ICRequestPayload[ECOpType.TxAdd]
  }

  [ECMType.ChainGetRequest]: {
    token: string,
    type: ECOpType.TxGet;
    timestamp: number,
    payload: ICRequestPayload[ECOpType.TxGet]
  }

  [ECMType.ChainSumRequest]: {
    token: string,
    type: ECOpType.TxSum;
    timestamp: number,
    payload: ICRequestPayload[ECOpType.TxSum]
  }

  [ECMType.NewTransaction]: Transaction
  [ECMType.NewBlock]: Block
}
