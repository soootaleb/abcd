import * as c from "https://deno.land/std/fmt/colors.ts";
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
    (message: IMessage<EMType>) => !this.exclude.includes(message.type),
    (message: IMessage<EMType>) => {
      return message.type === EMType.NewState
        && message.payload.to != message.payload.from
    },
  ];

  constructor() {
    super();

    this.console = Boolean(this.args["console-messages"]) ||
      Boolean(this.args["debug"]);

    // [TODO] Add IP destinations on connection open (peer, clients, UI, ...)
    for (const component of Object.keys(EComponent)) {
      addEventListener(component, (ev: Event) => {
        const event: CustomEvent = ev as CustomEvent;
        const message: IMessage<EMType> = event.detail;
        this.log(message);
      });
    }
  }

  private filter = (message: IMessage<EMType>): boolean => {
    for (const filter of this.filters) {
      if (typeof filter === "function" && !filter(message)) {
        return false;
      } else if (!filter) {
        return false;
      }
    }
    return true;
  };

  private log = (message: IMessage<EMType>) => {
    if (this.filter(message)) {
      let icon = "🔄".padEnd(1);
      let source = message.source.padEnd(20);
      let destination = message.destination.padEnd(20);
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.destination)) {
        icon = "🟢";
        destination = c.green(destination);
      } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(message.source)) {
        icon = "🔵";
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
          role = this.role;
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
          payload = payload.substr(0, 50);
          break;
        default:
          break;
      }

      const log = `${icon.padEnd(3)}${role.padEnd(3)}${source}${destination}${
        message.type.padEnd(25)
      }${payload}`;
      message.source === EComponent.Node
        ? console.log(c.bold(log))
        : console.log(log);
    }
  };

  private formatAndLog = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message: IMessage<EMType> = event.detail;
    this.log(message);
  }

  [EMType.LogMessage]: H<EMType.LogMessage> = this.log;

  [EMType.NewState]: H<EMType.NewState> = (message) => {
    this.role = message.payload.to;
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = message => {
    addEventListener(message.payload.clientIp, this.formatAndLog);
  }

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = message => {
    removeEventListener(message.payload.clientIp, this.formatAndLog)
  }

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionClose> = message => {
    removeEventListener(message.payload.peerIp, this.formatAndLog)
  }

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = message => {
    addEventListener(message.payload.peerIp, this.formatAndLog);
  }

  [EMType.PeerConnectionComplete]: H<EMType.PeerConnectionComplete> = message => {
    addEventListener(message.payload.peerIp, this.formatAndLog);
  }
}
