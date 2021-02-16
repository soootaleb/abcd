import { IMessage } from "./interfaces/interface.ts";
import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { IMPayload } from "./interfaces/mpayload.ts";

export default class Messenger extends Object {
  protected args: Args = parse(Deno.args);

  constructor() {
    super();

    addEventListener(this.constructor.name, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      const message: IMessage<EMType> = event.detail;
      // Yes, a bit ugly but...
      // Added deno lint ignore...
      // deno-lint-ignore no-explicit-any
      const self: any = this;
      if (this.hasOwnProperty(message.type)) {
        self[message.type](message);
      } else if (this.constructor.name != EComponent.Logger) {
        this.send(
          EMType.LogMessage,
          { message: "Missing handler for " + message.type },
          EComponent.Logger,
        );
      }
    });
  }

  protected send<T extends EMType>(
    type: T,
    payload: IMPayload[T],
    destination: EComponent | string,
    source?: string,
  ) {
    dispatchEvent(new CustomEvent(destination, {
      detail: {
        type: type,
        source: source
          ? source.toUpperCase().substring(0, 1) + source.substring(1)
          : this.constructor.name,
        destination: destination.toUpperCase().substring(0, 1) +
          destination.substring(1),
        payload: payload,
      },
    }));
  }
}
