import Messenger from "./messenger.ts";
import Node from "./node.ts";
import Observe from "https://deno.land/x/Observe/Observe.ts";
import { IMessage } from "./interfaces/interface.ts";
import { EMType, EOpType } from "./enumeration.ts";
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

  private _watch_interval = 1000;

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

    this.messages.bind((message) => {
      // deno-lint-ignore no-explicit-any
      const o: any = message;
      if (message.type === EMType.ClientRequest) {
        this.requests.push(o.payload.token);
      } else if (message.type === EMType.ClientResponse) {
        if (this.requests.includes(o.payload.token)) {
          this._mon.answered++;
        }
      }
    });

    if (this.args["mon"]) {
      setInterval(() => {
        console.clear();
        console.log(this.requests.length);
        console.log("DEBUG", this._mon.debugger / this.requests.length);
        console.log("ACCEPTED", this._mon.accepted / this.requests.length);
        console.log("COMMITED", this._mon.commited / this.requests.length);
        console.log("REJECTED", this._mon.rejected / this.requests.length);
        console.log(
          "TOTAL",
          (this._mon.rejected + this._mon.commited) / this.requests.length,
        );
        console.log("ANSWERED", this._mon.answered / this.requests.length);
      }, this._watch_interval);
    }
  }

  public get(key: string) {
    if (Object.keys(this._mon).includes(key)) {
      return this._mon[key];
    } else if (key.startsWith("/deno/")) {
      const [_, deno, metric] = key.split("/");
      return JSON.parse(JSON.stringify(Deno.metrics()))[metric];
    } else {
      return "undefined";
    }
  }

  public watch(
    key: string,
    watcher: string,
    expire = 1,
    interval = this._watch_interval,
  ) {
    this.watchers[watcher] = setInterval(() => {
      this.send(EMType.ClientNotification, {
        type: EOpType.MonWatch,
        payload: {
          key: key,
          value: this.get(key),
        },
      }, watcher);
    }, interval);
  }

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (
    message,
  ) => {
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
}
