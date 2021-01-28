import * as c from "https://deno.land/std/fmt/colors.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import { Args } from "https://deno.land/std/flags/mod.ts";
import type { IMessage } from "./interface.ts";
import { TState } from "./node.ts";

export default class Logger {
  private messages: Observe<IMessage>;

  private console = false;

  private uiMessagesActivated = false;
  private uiRefreshActivated = false;

  private _role = "starting";

  public set role(role: TState) {
    this._role = role
  }

  private static consoleIgnoredMessages = [
    "heartBeat",
    "uiLogMessage",
    "discoveryBeaconSent",
    "sendDiscoveryBeacon",
    "discoveryBeaconReceived"
  ]

  private static uiIgnoredMessages = Logger.consoleIgnoredMessages;

  constructor(messages: Observe<IMessage>, args: Args) {
    this.messages = messages;

    this.console = Boolean(args["console-messages"]) || Boolean(args["debug"]);
    this.uiMessagesActivated = Boolean(args["ui-messages"]) || Boolean(args["debug"]) || Boolean(args["ui-all"])
    this.uiRefreshActivated = Boolean(args["ui-refresh"]) || Boolean(args["debug"]) || Boolean(args["ui-all"])

    this.messages.bind((message: IMessage) => {
      this.log(message);
    });
  }

  private log(message: IMessage) {
    if (message.destination != "ui" && !Logger.uiIgnoredMessages.includes(message.type)) {
      /**
           * We wrap the messages for UI in another messages
           * - source is the current node sending the messages (so the UI can know it & deal with multiple nodes)
           * - destination is "ui" so there is no ambiguity for the network layer
           * - payload contains the log message we want to forward
           * 
           * This approach has been implemented because using messages with destination "ui"
           * in the application coupled the ui logging logic & created complexity
           * This way, the application has no messages with destination ui, only this log function
           */
      if (this.uiMessagesActivated || message.type === "uiStateUpdate") {
        this.messages.setValue({
          type: "uiLogMessage",
          source: "node",
          destination: "ui",
          payload: {
            message: message,
          },
        });
      }
    }

    if (this.console && !Logger.consoleIgnoredMessages.includes(message.type)) {
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
        case "starting":
          role = c.yellow(role);          
          break;
        case "follower":
          role = c.gray(role);          
          break;
        case "candidate":
          role = c.cyan(role);          
          break;
        case "leader":
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

  public ui(state: any) {
    if (this.uiRefreshActivated) {
      this.messages.setValue({
        type: "uiStateUpdate",
        source: "log",
        destination: "ui",
        payload: state,
      });
    }
  }
}
