import Messenger from "./messenger.ts";
import { IMessage, IMonOp, IMonWatch, IState } from "./interfaces/interface.ts";
import { EComponent, EMonOpType, EMType, EOpType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Monitor extends Messenger {

  private static readonly MON_WATCH_INTERVAL = 1000;

  constructor(protected state: IState) {
    super(state);

    for (const component of Object.keys(EComponent)) {
      addEventListener(component, (ev: Event) => {
        const event: CustomEvent = ev as CustomEvent;
        const message: IMessage<EMType> = event.detail;
        // deno-lint-ignore no-explicit-any
        const o: any = message;
        if (message.type === EMType.ClientRequest) {
          this.state.mon.requests.push(o.payload.token);
        } else if (message.type === EMType.ClientResponse) {
          if (this.state.mon.requests.includes(o.payload.token)) {
            this.state.mon.stats.answered++;
          }
        }

        if (
          message.type != EMType.ClientNotification &&
          message.type != EMType.HeartBeat &&
          message.type != EMType.DiscoveryBeaconSend
        ) {
          for (const logger of this.state.mon.loggers) {
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
    if (Object.keys(this.state.mon.stats).includes(key)) {
      return this.state.mon.stats[key];
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
    this.state.mon.loggers = this.state.mon.loggers.filter((logger) =>
      logger != message.payload.clientIp
    );
    clearInterval(this.state.mon.watchers[message.payload.clientIp]);
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    this.state.mon.stats.accepted++;
  };

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (
    message,
  ) => {
    this.state.mon.stats.commited += message.payload.length;
  };

  [EMType.StoreLogCommitFail]: H<EMType.StoreLogCommitFail> = (message) => {
    this.state.mon.stats.rejected++;
  };

  [EMType.LogMessage]: H<EMType.LogMessage> = (message) => {
    this.state.mon.stats.debugger++;
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
      this.state.mon.loggers.push(watcher);
    } else {
      this.state.mon.watchers[watcher] = setInterval(() => {
        this.send(EMType.ClientNotification, {
          type: EOpType.MonWatch,
          payload: {
            key: key,
            value: this.get(key),
          },
        }, watcher);
      }, Monitor.MON_WATCH_INTERVAL);
    }
  }
}
