import { IRequestPayload, IResponsePayload } from "ddapps/operation.ts";
import { Block } from "./block.ts";

export enum ECOpType {
  TxAdd = "TxAdd",
  TxGet = "TxGet",
  TxSum = "TxSum",
}

export interface ICRequestPayload extends IRequestPayload {
  [ECOpType.TxAdd]: {
    from: string;
    to: string;
    amount: number;
  };

  [ECOpType.TxGet]: null;

  [ECOpType.TxSum]: null;
}

export interface ICResponsePayload extends IResponsePayload {
  [ECOpType.TxAdd]: {
    from: string;
    to: string;
    amount: number;
  };

  [ECOpType.TxGet]: Block[];

  [ECOpType.TxSum]: {
    [key: string]: number;
  };
}