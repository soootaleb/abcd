import * as c from "https://deno.land/std/fmt/colors.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import { Args } from "https://deno.land/std/flags/mod.ts";
import type { IMessage } from "./interfaces/interface.ts";
import { EComponent, EMType, ENodeState } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Logger extends Messenger {

  private console = false;
  private payloads = false;

  private exclude: EMType[] = [
    EMType.HeartBeat,
    EMType.DiscoveryBeaconSend
  ]

  private role = ENodeState.Starting;

  /**
   * Messages will print only if every filter is passed (returns True)
   */
  private filters: ((message: IMessage<EMType>) => boolean)[] = [
    (message: IMessage<EMType>) => this.console,
    (message: IMessage<EMType>) => !this.exclude.includes(message.type)
  ]

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

    this.console = Boolean(this.args["console-messages"]) || Boolean(this.args["debug"]);

    this.messages.bind(this.log);
  }

  private filter = (message: IMessage<EMType>): boolean => {
    for (const filter of this.filters) {
      if(typeof filter === "function" && !filter(message)) {
        return false;
      } else if (!filter) {
        console.log(filter)
        return false;
      }
    }
    return true;
  }

  private log = (message: IMessage<EMType>) => {
    if (this.filter(message)) {
      let icon = "🔄".padEnd(1);
      let source = message.source.padEnd(20);
      let destination = message.destination.padEnd(20);
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.destination)) {
        icon = "🟢"
        destination = c.green(destination)
      } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.source)) {
        icon = "🔵"
        source = c.blue(source);
      }
      
      let role = this.role.toString();
      switch (this.role) {
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
          role = this.role
          break;
      }

      let payload = JSON.stringify(message.payload)
      switch(this.args["console-messages"]) {
        case "":
          break;
        case "full":
          break;
        case undefined:
          payload = '';
          break;
        case "partial":
          payload = payload.substr(0, 50)
          break;
        default:
          break;
      }

      const log = `${icon.padEnd(3)}${role.padEnd(3)}${source}${destination}${message.type.padEnd(25)}${payload}`;
      message.source === EComponent.Node ? console.log(c.bold(log)) : console.log(log)
    }
  }

  [EMType.LogMessage]: H<EMType.LogMessage> = this.log;

  [EMType.NewState]: H<EMType.NewState> = (message) => {
    this.role = message.payload.to
  }
}
