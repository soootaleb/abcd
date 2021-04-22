import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Discovery extends Messenger {

  private result(success: boolean, result: string, source: string) {
    this.send(EMType.DiscoveryResult, {
      success: success,
      result: result,
      source: source,
    }, EComponent.Node);
  }

  [EMType.DiscoveryStart]: H<EMType.DiscoveryStart> = (_) => {
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
}
