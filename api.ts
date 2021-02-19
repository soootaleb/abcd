import { EComponent, EMonOpType, EMType, EOpType } from "./enumeration.ts";
import { IKVOp, IKVWatch, IMonOp, IMonWatch } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Api extends Messenger {
  [EMType.ClientRequest]: H<EMType.ClientRequest> = (message) => {
    switch (message.payload.type) {
      case EOpType.KVOp: {
        this.send(
          EMType.KVOpRequest,
          {
            type: message.payload.type,
            token: message.payload.token,
            timestamp: message.payload.timestamp,
            payload: message.payload.payload as IKVOp,
          },
          EComponent.Node,
          message.source,
        );
        break;
      }
      case EOpType.KVWatch: {
        this.send(
          EMType.KVWatchRequest,
          {
            token: message.payload.token,
            timestamp: message.payload.timestamp,
            type: EOpType.KVWatch,
            payload: message.payload.payload as IKVWatch,
          },
          EComponent.Store,
          message.source,
        );
        break;
      }
      case EOpType.MonOp: {
        const payload = message.payload.payload as IMonOp;
        this.send(
          EMType.MonOpRequest,
          {
            token: message.payload.token,
            payload: {
              op: EMonOpType.Get,
              metric: {
                key: payload.metric.key,
              },
            },
            type: message.payload.type,
            timestamp: message.payload.timestamp,
          },
          EComponent.Monitor,
          message.source,
        );
        break;
      }
      case EOpType.MonWatch: {
        this.send(
          EMType.MonWatchRequest,
          message.payload as {
            token: string,
            type: EOpType.MonWatch,
            payload: IMonWatch,
            timestamp: number
          },
          EComponent.Monitor,
          message.source,
        );
        break;
      }
      default:
        this.send(EMType.InvalidClientRequestType, {
          invalidType: message.payload.type,
        }, EComponent.Logger);
        break;
    }
  };
}