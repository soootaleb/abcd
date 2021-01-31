import type { IKeyValue, ILog, IMessage } from "./interface.ts";

declare const self: Worker;

const encoder = new TextEncoder();

/**
 * First read to init the store in memory (for get requests)
 */
Deno.readTextFile(new URL('..', import.meta.url).pathname + "data/store.json")
    .then((content) => {
        self.postMessage({
            type: "initStore",
            source: "store.worker",
            destination: "store",
            payload: JSON.parse(content || "{}")
        })
    })

function apply(log: ILog) {
    switch (log.action) {
        case "put":
            Deno.readTextFile(new URL('..', import.meta.url).pathname + "data/store.json")
                .then((content) => {
                    const store: {[key: string]: IKeyValue } = JSON.parse(content || "{}");
                    store[log.next.key] = {
                        key: log.next.key,
                        value: log.next.value
                    };
                    return encoder.encode(JSON.stringify(store))
                }).then((store) => {
                    Deno.writeFile(new URL('..', import.meta.url).pathname + "data/store.json", store)
                        .then(() => {
                            self.postMessage({
                                type: "logApplied",
                                source: "store.worker",
                                destination: "log",
                                payload: log
                            })
                        })
                })
            break;
        default:
            self.postMessage({
                type: "invalidLog",
                source: "store.worker",
                destination: "log",
                payload: {
                    log: log
                }
            })
    }
}

function handleMessage(message: IMessage<any>) {
  switch (message.type) {
    case "applyLogInStore":
        apply(message.payload.log);
        break;
    default:
      return {
        type: "invalidMessageType",
        source: "store.worker",
        destination: "log",
        payload: {
          message: message,
        },
      };
  }
}

self.onmessage = async (e: MessageEvent) => {
  const message: IMessage = e.data;

  const destination = message.destination;

  if (destination == "store.worker") {
    handleMessage(message);
  } else {
    self.postMessage({
      type: "invalidMessageDestination",
      source: "store.worker",
      destination: "log",
      payload: {
        message: message,
      },
    } as IMessage);
  }
};
