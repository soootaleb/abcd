import { EComponent, EKVOpType } from "../enumeration.ts";
import type {
  IEntry,
  IKeyValue,
  ILog,
  IMessage,
} from "../interfaces/interface.ts";
import { EMType } from "../enumeration.ts";
import { IMPayload } from "../interfaces/mpayload.ts";
import { H } from "../type.ts";
import Store from "../store.ts";
import { Args, parse } from "https://deno.land/std/flags/mod.ts";

declare const self: Worker;

export default class StoreWorker {
  
  private args: Args = parse(Deno.args);
  private buffer: IEntry[] = [];
  private encoder = new TextEncoder();
  private _data_dir = Store.DEFAULT_DATA_DIR;
  
  private static readonly STORE_WRITE_INTERVAL = 1000;

  private postMessage: <T extends EMType>(message: IMessage<T>) => void =
    self.postMessage;

  constructor() {
    self.onmessage = this.onmessage;
    
    this._data_dir = typeof this.args["data-dir"] === "string"
      ? this.args["data-dir"]
      : Store.DEFAULT_DATA_DIR;

    Deno.readTextFile(this._data_dir + "/store.json")
      .then((content) => {
        this.send(
          EMType.StoreInit,
          JSON.parse(content || "{}"),
          EComponent.Store,
        );
      });

    setInterval(() => {
      Deno.readTextFile(this._data_dir + "/store.json")
        .then((content) => {
          const store: { [key: string]: IKeyValue } = JSON.parse(
            content || "{}",
          );
          for (const entry of this.buffer) {
            const log = entry.log;
            if (log.op === EKVOpType.Put) {
              store[log.next.key] = {
                key: log.next.key,
                value: log.next.value,
              };
            } else {
              this.send(EMType.LogMessage, {
                message: "Invalid EKVOPType " + log.op,
              }, EComponent.Logger);
            }
          }
          return store;
        }).then((store) => {
          const txt = this.encoder.encode(JSON.stringify(store));
          Deno.writeFile(this._data_dir + "/store.json", txt)
        });
    }, StoreWorker.STORE_WRITE_INTERVAL);
  }

  private send<T extends EMType>(
    type: T,
    payload: IMPayload[T],
    destination: EComponent | string,
  ) {
    this.postMessage({
      type: type,
      source: this.constructor.name,
      destination: destination.toUpperCase().substring(0, 1) +
        destination.substring(1),
      payload: payload,
    });
  }

  onmessage = async (ev: MessageEvent<IMessage<EMType>>) => {
    const message = ev.data;

    const destination = message.destination;

    if (destination == EComponent.StoreWorker) {
      // deno-lint-ignore no-this-alias no-explicit-any
      const self: any = this;
      if (Object.keys(this).includes(message.type)) {
        self[message.type](message);
      } else {
        this.send(
          EMType.LogMessage,
          { message: "Missing handler for " + message.type },
          EComponent.Logger,
        );
      }
    } else {
      this.send(EMType.LogMessage, {
        message: `Received message for ${message.destination}`,
      }, EComponent.Logger);
    }
  };

  [EMType.StoreLogCommitRequest]: H<EMType.StoreLogCommitRequest> = (
    message,
  ) => {
    this.buffer.push(message.payload);
  };
}

new StoreWorker();
