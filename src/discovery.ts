import type { IMessage } from "./interface.ts";

import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Discovery {

  private worker: Worker;
  private messages: Observe<IMessage>;

  private discoveryBeanconInterval = 3000;

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    this.worker = new Worker(new URL("./discovery.worker.ts", import.meta.url).href, {
      type: "module",
      deno: true,
    });

    this.worker.onmessage = (e: MessageEvent) => {
      this.messages.setValue(e.data);
    };

    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "discovery") {
        this.handleMessage(message);
      } else if (message.destination === "discovery.worker") {
        this.worker.postMessage(message);
      }
    });

    setInterval(() => {
      this.messages.setValue({
        type: "sendDiscoveryBeancon",
        source: "discovery",
        destination: "discovery.worker",
        payload: {}
      });
    }, this.discoveryBeanconInterval)
  }

  /**
   * Method to handle message with destination DISCOVERY
   * @param message message with destination == "discovery"
   */
  private handleMessage(message: IMessage) {
    switch (message.type) {
      case "discoveryServerStarted":
        this.messages.setValue({
          type: "discoveryServerStarted",
          source: "discovery",
          destination: "log",
          payload: message.payload,
        });
        break;
      case "discoveryBeacon":
        this.messages.setValue({
          type: "discoveryBeaconReceived",
          source: "discovery",
          destination: "log",
          payload: message.payload,
        });
        break;
      default:
        this.messages.setValue({
          type: "invalidMessageType",
          source: "discovery",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
    }
  }
}