import * as c from "https://deno.land/std/fmt/colors.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import type { IMessage } from "./interface.ts";

export default class Logger {
  private messages: Observe<IMessage>;

  private _console: Boolean = false;

  public set console(yes: Boolean) {
    this._console = yes;
  }

  private uiMessagesActivated: Boolean = false;
  private uiRefreshActivated: Boolean = false;

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    this.messages.bind((message: IMessage) => {
      this.log(message);
    });
  }

  private log(message: IMessage) {
    if (message.destination != "ui" && message.type != "heartBeat") {
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

    if (
      this._console && !["heartBeat", "uiLogMessage"].includes(message.type)
    ) {
      console.log(
        c.bgWhite(
          "                                                                                   ",
        ),
      );
      if (message.type == "serverStarted") {
        console.log(
          c.bgBrightMagenta(
            c.brightYellow(
              c.bold(
                `[${message.source}]->[${message.destination}][${message.type}]${
                  JSON.stringify(message.payload)
                }`,
              ),
            ),
          ),
        );
      } else {
        console.log(
          c.gray(
            `[${message.source}]->[${message.destination}][${message.type}]${
              JSON.stringify(message.payload)
            }`,
          ),
        );
      }
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
