import Messenger from "./messenger.ts";
import { IMessage, IMonOp, IMonWatch } from "./interfaces/interface.ts";
import { EComponent, EMonOpType, EMType, EOpType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Monitor extends Messenger {
  private requests: string[] = [];
  private _mon: {
    [key: string]: number;
  } = {
    answered: 0,
    commited: 0,
    accepted: 0,
    rejected: 0,
    debugger: 0,
  };

  private watchers: {
    [key: string]: number;
  } = {};

  private loggers: string[] = [];

  private _watch_interval = 1000;

  constructor() {
    super();

    for (const component of Object.keys(EComponent)) {
      addEventListener(component, (ev: Event) => {
        const event: CustomEvent = ev as CustomEvent;
        const message: IMessage<EMType> = event.detail;
        // deno-lint-ignore no-explicit-any
        const o: any = message;
        if (message.type === EMType.ClientRequest) {
          this.requests.push(o.payload.token);
        } else if (message.type === EMType.ClientResponse) {
          if (this.requests.includes(o.payload.token)) {
            this._mon.answered++;
          }
        }

        if (
          message.type != EMType.ClientNotification &&
          message.type != EMType.HeartBeat &&
          message.type != EMType.DiscoveryBeaconSend
        ) {
          for (const logger of this.loggers) {
            this.send(EMType.ClientNotification, {
              type: EOpType.MonWatch,
              payload: {
                key: "/abcd/logs",
                value: message,
              },
            }, logger);
          }
        }
      });
    }
  }

  private get(key: string) {
    if (Object.keys(this._mon).includes(key)) {
      return this._mon[key];
    } else if (key.startsWith("/deno/")) {
      const [_, deno, metric] = key.split("/");
      return metric
        ? {
          ...JSON.parse(JSON.stringify(Deno.metrics())),
          loadavg: Deno.loadavg(),
          hostname: Deno.hostname(),
        }[metric]
        : Deno.metrics();
    } else {
      return "undefined";
    }
  }

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (
    message,
  ) => {
    this.loggers = this.loggers.filter((logger) =>
      logger != message.payload.clientIp
    );
    clearInterval(this.watchers[message.payload.clientIp]);
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    this._mon.accepted++;
  };

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (
    message,
  ) => {
    this._mon.commited++;
  };

  [EMType.StoreLogCommitFail]: H<EMType.StoreLogCommitFail> = (message) => {
    this._mon.rejected++;
  };

  [EMType.LogMessage]: H<EMType.LogMessage> = (message) => {
    this._mon.debugger++;
  };

  [EMType.MonOpRequest]: H<EMType.MonOpRequest> = message => {
    const payload = message.payload.payload as IMonOp;
    this.send(EMType.ClientResponse, {
      token: message.payload.token,
      payload: {
        op: EMonOpType.Get,
        metric: {
          key: payload.metric.key,
          value: this.get(payload.metric.key),
        },
      },
      type: message.payload.type,
      timestamp: message.payload.timestamp,
    }, message.source);
  }

  [EMType.MonWatchRequest]: H<EMType.MonWatchRequest> = message => {
    const payload = message.payload.payload as IMonWatch;
    const key = payload.key;
    const watcher = message.source;
    if (key.startsWith("/abcd/logs")) {
      this.loggers.push(watcher);
    } else {
      this.watchers[watcher] = setInterval(() => {
        this.send(EMType.ClientNotification, {
          type: EOpType.MonWatch,
          payload: {
            key: key,
            value: this.get(key),
          },
        }, watcher);
      }, this._watch_interval);
    }
  }
}
