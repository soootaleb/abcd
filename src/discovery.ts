import type { IMessage } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Discovery extends Messenger {
  public static PROTOCOLS = ["udp", "http"];
  public static DEFAULT_PROTOCOL = "udp";

  private worker: Worker;

  private _ready = false;
  private _protocol = "udp";

  private get protocol() {
    return this._protocol;
  }

  private set protocol(mode: string) {
    if (Discovery.PROTOCOLS.includes(mode)) {
      this._protocol = mode;
      this.send(EMType.DiscoveryProtocolSet, {
        protocol: this.protocol,
      }, EComponent.Logger);
    } else {
      this.send(EMType.InvalidDiscoveryProtocol, {
        invalid: mode,
        default: Discovery.DEFAULT_PROTOCOL,
        available: Discovery.PROTOCOLS,
      }, EComponent.Logger);
    }
  }

  public get ready() {
    return this._ready;
  }

  constructor() {
    super();

    this.worker = new Worker(
      new URL('.', import.meta.url).href + 'workers/discovery.worker.ts',
      {
        type: "module",
        deno: true,
      },
    );

    this.protocol = typeof this.args["discovery"] === "string"
      ? this.args["discovery"]
      : Discovery.DEFAULT_PROTOCOL;

    this.worker.onmessage = (ev: MessageEvent) => {
      const message: IMessage<EMType> = ev.data;
      this.send(
        message.type,
        message.payload,
        message.destination,
        message.source,
      );
    };

    addEventListener(EComponent.DiscoveryWorker, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      this.worker.postMessage(event.detail);
    });
  }

  [EMType.DiscoveryBeaconSend]: H<EMType.DiscoveryBeaconSend> = (message) => {
    if (this.ready) {
      this.send(message.type, null, EComponent.DiscoveryWorker);
    } else {
      this.send(EMType.DiscoveryBeaconSendFail, {
        reason: "discoveryServiceNotReady",
        ready: this.ready,
      }, EComponent.Logger);
    }
  };

  [EMType.DiscoveryServerStarted]: H<EMType.DiscoveryServerStarted> = (
    message,
  ) => {
    this._ready = true;
    this.send(EMType.DiscoveryServerStarted, message.payload, EComponent.Node);
  };

  [EMType.DiscoveryBeaconReceived]: H<EMType.DiscoveryBeaconReceived> = (
    message,
  ) => {
    if (this.protocol === "udp") {
      this.result(true, message.payload.addr.hostname, "beacon_received");
    }
  };

  public discover() {
    if (this.protocol === "http") {
      const url = "http://" + Deno.env.get("ABCD_CLUSTER_HOSTNAME") +
        ":8080/discovery";
      fetch(url).then((response) => response.text())
        .then((ip) => {
          this.result(true, ip, "http_success");
        }).catch((error) => {
          this.result(false, error.message, "http_fail");
        });
    } else {
      this.result(
        false,
        "node called discovery.discover() but protocol is " + this.protocol,
        "passive_discovery",
      );
    }
  }

  private result(success: boolean, result: string, source: string) {
    this.send(EMType.DiscoveryResult, {
      success: success,
      result: result,
      source: source,
    }, EComponent.Node);
  }
}
