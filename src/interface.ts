import { EMTypes } from "./enumeration.ts";

export interface IMessage<T extends EMTypes> {
  type: T,
  source: string,
  destination: string,
  payload: IMPayload[T]
}

export interface IKeyValue<T = string | number> {
  key: string;
  value: T;
}

export interface ILog<T = string | number> {
  action: "put";
  commited: boolean;
  timestamp: number;
  previous?: IKeyValue<T>;
  next: IKeyValue<T>;
}

export interface IWal {
  [key: string]: {log: ILog, token: string}[];
}

/**
 * ============= MESSAGES PAYLOADS DEFINITION ====================
 */

export interface IMPayload {
  [EMTypes.Pong]: null, // Empty payloads...
  [EMTypes.Ping]: null, // Empty payloads...
  [EMTypes.InitialMessage]: null,
  [EMTypes.LogMessage]: {
    message: string
  } // Simple payloads
  [EMTypes.MessageRequest]: {
      key: string,
      value: string
      token: string,
      complex: IMPayload[EMTypes.MessageResponse] // A message can contain the payload of another type
  }
  [EMTypes.MessageResponse]: {
      value: string,
      token: boolean
  }
}