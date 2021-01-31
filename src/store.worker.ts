import type { IMessage } from "./interface.ts";

declare const self: Worker;

function handleMessage(message: IMessage<any>): IMessage {
  switch (message.type) {
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
    self.postMessage(handleMessage(message));
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
