import type { IMessage } from "./interface.ts";

import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Discovery {

  public static PROTOCOLS = ["udp", "http"];
  public static DEFAULT = "udp";

  private worker: Worker;
  private messages: Observe<IMessage>;

  private _ready = false;
  private _protocol = "udp";

  public get protocol() {
    return this._protocol
  }
  
  public set protocol(mode: string) {
    if (Discovery.PROTOCOLS.includes(mode)) {
      this._protocol = mode;
      this.messages.setValue({
        type: "discoveryProtocolSet",
        source: "discovery",
        destination: "log",
        payload: {
          protocol: this.protocol
        }
      })
    } else {
      this.messages.setValue({
        type: "invalidDiscoveryProtocol",
        source: "discovery",
        destination: "log",
        payload: {
          invalid: mode,
          default: Discovery.DEFAULT,
          available: Discovery.PROTOCOLS
        }
      })
    }
  }

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
    addr: Deno.NetAddr
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
      case "discoveryBeaconReceived":
        if (this.protocol === "udp") {
          this.result(true, message.payload.addr.hostname, "beacon_received");
        }
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

  public discover() {
    if (this.protocol === "http") {
      const url = "http://" + Deno.env.get("ABCD_CLUSTER_HOSTNAME") + ":8080/discovery"
      fetch(url).then((response) => response.text())
        .then((ip) => {
          this.result(true, ip, "http_success");
        }).catch((error) => {
          this.result(false, error.message, "http_fail");
        })
    } else {
      this.result(false, "node called discovery.discover() but protocol is " + this.protocol, "passive_discovery")
    }
  }

  private result(success: boolean, result: string, source: string) {
    this.messages.setValue({
      type: "discoveryResult",
      source: "discovery",
      destination: "node",
      payload: {
        success: success,
        result: result,
        source: source
      }
    })
  }
}