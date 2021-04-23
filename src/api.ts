import { EComponent, EMonOpType, EMType, ENodeState, EOpType } from "./enumeration.ts";
import { IKVOp, IKVWatch, IMonOp, IMonWatch, IState } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Api extends Messenger {

  constructor(protected state: IState) {
    super(state);
  }
  
  [EMType.ClientRequest]: H<EMType.ClientRequest> = (message) => {
    this.state.net.requests[message.payload.token] = message.source;
    switch (message.payload.type) {
      case EOpType.KVOp: {
        if (this.state.role === ENodeState.Leader) {
          this.send(
            EMType.KVOpRequest,
            {
              type: message.payload.type,
              token: message.payload.token,
              timestamp: message.payload.timestamp,
              payload: message.payload.payload as IKVOp,
            },
            EComponent.Store
          );
        } else {
          this.send(EMType.ClientRequestForward, message.payload, this.state.leader);
        }
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
          EComponent.Store
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
          EComponent.Monitor
        );
        break;
      }
      case EOpType.MonWatch: {
        this.send(
          EMType.MonWatchRequest,
          message.payload as {
            token: string;
            type: EOpType.MonWatch;
            payload: IMonWatch;
            timestamp: number;
          },
          EComponent.Monitor
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

  [EMType.ClientResponse]: H<EMType.ClientResponse> = message => {
    if (Object.keys(this.state.net.requests).includes(message.payload.token)) {
      this.send(EMType.ClientResponse, message.payload, this.state.net.requests[message.payload.token]);
      delete this.state.net.requests[message.payload.token];
    }
  }

  [EMType.ClientNotification]: H<EMType.ClientNotification> = message => {
    if (Object.keys(this.state.net.requests).includes(message.payload.token)) {
      this.send(EMType.ClientNotification, message.payload, this.state.net.requests[message.payload.token]);
    }
  }

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = message => {
    const requests = Object.entries(this.state.net.requests)
      .filter(o => o[1] === message.payload.clientIp)

    // Requests
    if (requests.length) {
      for (const request of requests) {
        delete this.state.net.requests[request[0]];
      }
    }
    
    // MonWatch on logs
    this.state.mon.loggers = this.state.mon.loggers
      .filter(o => !requests.map(o => o[0]).includes(o));

    // MonWatch Interval
    clearInterval(this.state.mon.watchers[message.payload.clientIp]);
  }
}
