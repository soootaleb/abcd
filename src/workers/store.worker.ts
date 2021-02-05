import { EKVOpType } from "../enumeration.ts";
import type { IKeyValue, ILog, IMessage } from "../interfaces/interface.ts";
import { EMType } from "../enumeration.ts";
import { IMPayload } from "../interfaces/mpayload.ts";
import { H } from "../type.ts";
import Store from "../store.ts";

declare const self: Worker;

export default class StoreWorker {
  private encoder = new TextEncoder();

  private postMessage: <T extends EMType>(message: IMessage<T>) => void =
    self.postMessage;

  constructor() {
    self.onmessage = this.onmessage;

    Deno.readTextFile(Store.STORE_DATA_DIR + "store.json")
      .then((content) => {
        this.send(EMType.StoreInit, JSON.parse(content || ""), "Store");
      });
  }

  private send<T extends EMType>(
    type: T,
    payload: IMPayload[T],
    destination: string,
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

    if (destination == "DiscoveryWorker") {
      // deno-lint-ignore no-this-alias no-explicit-any
      const self: any = this;
      if (Object.keys(this).includes(message.type)) {
        self[message.type](message);
      } else {
        this.send(
          EMType.LogMessage,
          { message: "Missing handler for " + message.type },
          "Logger",
        );
      }
    } else {
      this.send(EMType.InvalidMessageType, message, "Logger");
    }
  };

  [EMType.KVOpStoreApply]: H<EMType.KVOpStoreApply> = (message) => {
    const log = message.payload.log;

    if (log.op === EKVOpType.Put) {
      Deno.readTextFile(Store.STORE_DATA_DIR + "store.json")
        .then((content) => {
          const store: { [key: string]: IKeyValue } = JSON.parse(
            content || "{}",
          );
          store[log.next.key] = {
            key: log.next.key,
            value: log.next.value,
          };
          return this.encoder.encode(JSON.stringify(store));
        }).then((store) => {
          Deno.writeFile(Store.STORE_DATA_DIR + "store.json", store)
            .then(() =>
              this.send(EMType.StoreLogCommitSuccess, message.payload, "Logger")
            );
        });
    } else {
      this.send(EMType.LogMessage, {
        message: "Invalid EKVOPType " + log.op,
      }, "Logger");
    }
  };
}

new StoreWorker();
