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

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

    this.console = Boolean(this.args["console-messages"]) || Boolean(this.args["debug"]);
    this.payloads = this.args["console-messages"] === "full" || Boolean(this.args["debug"]);

    this.messages.bind(this.log);
  }

  private log = (message: IMessage<EMType>) => {
    if (this.console && !this.exclude.includes(message.type)) {
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

      let role = this.role.toString();
      switch (this.role) {
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
          role = this.role
          break;
      }

      role = `[${role}]`.padEnd(22);
      source = `[${source}]`.padEnd(20);
      destination = `[${destination}]`.padEnd(20);

      const log = `${icon}${role}${source}->${destination}[${message.type}]${this.payloads ? JSON.stringify(message.payload): ''}`;
      message.source === EComponent.Node ? console.log(c.bold(log)) : console.log(log)
    }
  }

  [EMType.LogMessage]: H<EMType.LogMessage> = this.log;

  [EMType.NewState]: H<EMType.NewState> = (message) => {
    this.role = message.payload.to
  }
}
