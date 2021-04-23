import Messenger from "./messenger.ts";
import { IMessage, IMonOp, IMonWatch, IState } from "./interfaces/interface.ts";
import { EComponent, EMonOpType, EMType, EOpType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Monitor extends Messenger {

  private static readonly MON_WATCH_INTERVAL = 1000;

  constructor(protected state: IState) {
    super(state);

    for (const component of Object.values(EComponent)) {
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
          message.type != EMType.NewState
        ) {
          for (const logger of this.state.mon.loggers) {
            this.send(EMType.ClientNotification, {
              token: logger,
              type: EOpType.MonWatch,
              payload: {
                key: "/abcd/logs",
                value: message,
              },
            }, EComponent.Api);
          }
        }
      });
    }
  }

  private get(key: string) {
    if (key.startsWith("/deno/")) {
      const [_, __, metric] = key.split("/");
      return metric
        ? {
          ...JSON.parse(JSON.stringify(Deno.metrics())),
          loadavg: Deno.loadavg(),
          hostname: Deno.hostname(),
        }[metric]
        : Deno.metrics();
    } else if (key.startsWith("/abcd/node/state/")) {
      const path = key.substring("/abcd/node/state/".length)
      const keys = path.split('/');
      // deno-lint-ignore no-explicit-any
      let payload: any = this.state;
      for (const key of keys) {
        if(Object.keys(payload).includes(key)) {
          payload = payload[key];
        } else {
          return "NoSuchKey::" + key;
        }
      }
      return payload;
    } else {
      return "NoSuchKey::" + key;
    }
  }

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (_) => {
    this.state.mon.stats.accepted++;
  };

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (
    message,
  ) => {
    this.state.mon.stats.commited += message.payload.length;
  };

  [EMType.StoreLogCommitFail]: H<EMType.StoreLogCommitFail> = (_) => {
    this.state.mon.stats.rejected++;
  };

  [EMType.LogMessage]: H<EMType.LogMessage> = (_) => {
    this.state.mon.stats.debugger++;
  };

  [EMType.MonOpRequest]: H<EMType.MonOpRequest> = message => {
    const payload = message.payload.payload as IMonOp;
    if (/^\/abcd\/node\/(?:[0-9]{1,3}\.){3}[0-9]{1,3}(-[0-9]+)?\//.test(payload.metric.key)) {
      const [_, __, ___, ip, ____] = payload.metric.key.split('/')
      const peer = Object.keys(this.state.net.peers)
        .find((peer) => peer === ip || peer.startsWith(ip + '-'))
      if (peer) {
        this.send(EMType.ClientRequestForward, {
          ...message.payload,
          payload: {
            ...message.payload.payload,
            metric: {
              ...message.payload.payload.metric,
              key: payload.metric.key.replace('/' + ip, '')
            }
          }
        }, peer)
      } else if (ip === Deno.env.get("ABCD_NODE_IP")) {
        this.send(EMType.MonOpRequest, {
          ...message.payload,
          payload: {
            ...message.payload.payload,
            metric: {
              ...message.payload.payload.metric,
              key: payload.metric.key.replace('/' + ip, '')
            }
          }
        }, EComponent.Monitor);
      } else {
        this.send(EMType.ClientResponse, {
          token: message.payload.token,
          payload: {
            op: EMonOpType.Get,
            metric: {
              key: payload.metric.key,
              value: "NoSuchPeer::" + ip,
            },
          },
          type: message.payload.type,
          timestamp: message.payload.timestamp,
        }, EComponent.Api);
      }
    } else {
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
      }, EComponent.Api);
    }
  }

  [EMType.MonWatchRequest]: H<EMType.MonWatchRequest> = message => {
    const payload = message.payload.payload as IMonWatch;
    const key = payload.key;
    const watcher = message.payload.token;
    if (key.startsWith("/abcd/logs")) {
      this.state.mon.loggers.push(watcher);
    } else {
      this.state.mon.watchers[watcher] = setInterval(() => {
        this.send(EMType.ClientNotification, {
          token: watcher,
          type: EOpType.MonWatch,
          payload: {
            key: key,
            value: this.get(key),
          },
        }, EComponent.Api);
      }, Monitor.MON_WATCH_INTERVAL);
    }
  }
}
