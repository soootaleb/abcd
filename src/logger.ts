import * as c from "https://deno.land/std/fmt/colors.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import { Args } from "https://deno.land/std/flags/mod.ts";
import type { IMessage } from "./interfaces/interface.ts";
import { EMType, ENodeState } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Logger extends Messenger {

  private console = false;

  private _role = "starting";

  public set role(role: ENodeState) {
    this._role = role
  }

  constructor(messages: Observe<IMessage<EMType>>, args: Args) {
    super(messages);

    this.console = Boolean(args["console-messages"]) || Boolean(args["debug"]);
  }


  [EMType.LogMessage]: H<EMType.LogMessage> = (message) => {

    if (this.console) {
      let icon = "🔄";
      let source = message.source;
      let destination = message.destination;
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.destination)) {
        icon = "🟢"
        destination = c.green(destination)
      } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.source)) {
        icon = "🔵"
        source = c.blue(source);
      }

      let role = this._role
      switch (this._role) {
        case ENodeState.Starting:
          role = c.yellow(role);          
          break;
        case ENodeState.Follower:
          role = c.gray(role);          
          break;
        case ENodeState.Candidate:
          role = c.cyan(role);          
          break;
        case ENodeState.Leader:
          role = c.brightMagenta(role);          
          break;
      
        default:
          role = this._role
          break;
      }

      const log = `${icon}[${role}][${source}]->[${destination}][${message.type}]${JSON.stringify(message.payload)}`;
      message.source === "node" ? console.log(c.bold(log)) : console.log(log)
    }
  }
}
