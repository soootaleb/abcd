import * as c from "std/fmt/colors.ts";
import { Logger } from "ddapps/logger.ts";
import { ENodeState } from "./enumeration.ts";
import { IKVState } from "./interface.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import { IKVRequestPayload, IKVResponsePayload } from "./operation.ts";
import { KVM } from "./type.ts";

export  class KVLogger extends Logger<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
> {
  protected get filters(): ((message: KVM<keyof IKVMPayload>) => boolean)[] {
    return [
      ...super.filters,

      (message: KVM<keyof IKVMPayload>) => { // only print NewState if state changes
        if (message.type === EKVMType.NewState) {
          const payload: IKVMPayload[EKVMType.NewState] = message
            .payload as IKVMPayload[EKVMType.NewState];
          return payload.to != payload.from;
        } else {
          return true;
        }
      },
    ];
  }

  /**
   * Add role display
   * @param message
   */
  protected log(message: KVM<keyof IKVMPayload>) {
    if (this.filter(message)) {
      let icon = "🔄".padEnd(1);
      let source = message.source.padEnd(20);
      let destination = message.destination.padEnd(20);
      if (
        /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(-[0-9]+)?$/.test(message.destination)
      ) {
        icon = "🟢";
        destination = c.green(destination);
      } else if (
        /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(-[0-9]+)?$/.test(message.source)
      ) {
        icon = "🔵";
        source = c.blue(source);
      }

      let role = this.state.role.toString();
      switch (this.state.role) {
        case ENodeState.Starting:
          role = "🟡";
          break;
        case ENodeState.Follower:
          role = "🟤";
          break;
        case ENodeState.Candidate:
          role = "🟠";
          break;
        case ENodeState.Leader:
          role = "🔴";
          break;

        default:
          role = this.state.role;
          break;
      }

      let payload = JSON.stringify(message.payload);
      switch (this.args["console-messages"]) {
        case "":
          break;
        case "full":
          break;
        case undefined:
          payload = "";
          break;
        case "partial":
          payload = payload.substr(0, 100);
          break;
        default:
          break;
      }

      const now = new Date().getTime();
      const time = Math.min(now - this.state.log.last, 9999);
      this.state.log.last = now;

      const log = `${icon.padEnd(3)}${role.padEnd(3)}${
        time.toString().padEnd(5)
      }${source}${destination}${message.type.padEnd(25)}${payload}`;

      console.log(log);
    }
  }
}
