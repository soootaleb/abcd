import type { IMessage, IState } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Discovery extends Messenger {
  public static PROTOCOLS = ["udp", "http"];
  public static DEFAULT_PROTOCOL = "udp";

  constructor(private state: IState) {
    super();
  }

  private set protocol(mode: string) {
    if (Discovery.PROTOCOLS.includes(mode)) {
      this.protocol = mode;
      this.send(EMType.DiscoveryProtocolSet, {
        protocol: this.state.discovery.protocol,
      }, EComponent.Logger);
    } else {
      this.send(EMType.InvalidDiscoveryProtocol, {
        invalid: mode,
        default: Discovery.DEFAULT_PROTOCOL,
        available: Discovery.PROTOCOLS,
      }, EComponent.Logger);
    }
  }

  [EMType.DiscoveryBeaconSend]: H<EMType.DiscoveryBeaconSend> = (message) => {
    if (this.state.discovery.ready) {
      this.send(message.type, null, EComponent.DiscoveryWorker);
    } else {
      this.send(EMType.DiscoveryBeaconSendFail, {
        reason: "discoveryServiceNotReady",
        ready: this.state.discovery.ready,
      }, EComponent.Logger);
    }
  };

  [EMType.DiscoveryServerStarted]: H<EMType.DiscoveryServerStarted> = (
    message,
  ) => {
    this.state.discovery.ready = true;
    this.send(EMType.DiscoveryServerStarted, message.payload, EComponent.Node);
  };

  [EMType.DiscoveryBeaconReceived]: H<EMType.DiscoveryBeaconReceived> = (
    message,
  ) => {
    if (this.state.discovery.protocol === "udp") {
      this.result(true, message.payload.addr.hostname, "beacon_received");
    }
  };

  [EMType.DiscoveryStart]: H<EMType.DiscoveryStart> = message => {
    if (this.state.discovery.protocol === "http") {
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
        "node called discovery.discover() but protocol is " + this.state.discovery.protocol,
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
