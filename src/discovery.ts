import type { IMessage } from "./interface.ts";

import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Discovery {

  private worker: Worker;
  private messages: Observe<IMessage>;

  private _ready = false;

  public get ready() {
    return this._ready;
  }

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
  }

  /**
   * Method to handle message with destination DISCOVERY
   * @param message message with destination == "discovery"
   */
  private handleMessage(message: IMessage<{
    discover: boolean
  }>) {
    switch (message.type) {
      case "sendDiscoveryBeacon":
        if (this.ready) {
          this.messages.setValue({
            type: "sendDiscoveryBeacon",
            source: "discovery",
            destination: "discovery.worker",
            payload: {}
          });
        } else {
          this.messages.setValue({
            type: "sendDiscoveryBeaconFailed",
            source: "discovery",
            destination: "log",
            payload: {
              reason: "discoveryServiceNotReady",
              ready: this.ready
            }
          })
        }
        break;
      case "discoveryServerStarted":
        this._ready = true;
        this.messages.setValue({
          type: "discoveryServerStarted",
          source: "discovery",
          destination: "node",
          payload: {}
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