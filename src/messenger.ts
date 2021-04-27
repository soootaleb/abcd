import { IMessage, IState } from "./interfaces/interface.ts";
import { Args, parse } from "https://deno.land/std/flags/mod.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { IMPayload } from "./interfaces/mpayload.ts";

/**
 * Messenger components can simply implement methods of [EMType.Message] to leverage messages' typing
 * Message handlers are functions type with H (from types.ts)
 * 
 * Messenger components can send messages with the .send() method to get payload typing based on the EMType.Message
 */
export default class Messenger extends Object {
  protected args: Args = parse(Deno.args);

  private handle = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message: IMessage<EMType> = event.detail;
    // Yes, a bit ugly but...
    // Added deno lint ignore...
    // deno-lint-ignore no-explicit-any no-this-alias
    const self: any = this;
    // deno-lint-ignore no-prototype-builtins
    if (this.hasOwnProperty(message.type)) {
      self[message.type](message);
    } else if (this.constructor.name != EComponent.Logger) {
      this.send(
        EMType.LogMessage,
        { message: "Missing handler for " + message.type },
        EComponent.Logger,
      );
    }
  }

  constructor(protected state: IState) {
    super();

    // Messenger components subscribe to events of their class name
    // That's why EComponent must have the same names as the messengers
    addEventListener(this.constructor.name, this.handle, {
      passive: true
    });
  }

  /**
   * Used to prevent the object from listening events
   * Not part of the software, used for unit tests
   */
  public shutdown() {
    removeEventListener(this.constructor.name, this.handle)
  }

  /**
   * Allows to send messages with typed payloads
   * @param type EMType
   * @param payload Associated payload
   * @param destination The component to send the message to
   * @param source if necessary, define the source to override the sender's class name. At your own risk...
   */
  public send<T extends EMType>(
    type: T,
    payload: IMPayload[T],
    destination: EComponent | string, // string is used for peers & clients (IPs)
    source?: string, // to forward messages transparently like the API
  ) {
    setTimeout(() => {
      dispatchEvent(
        new CustomEvent(destination, {
          detail: {
            type: type,
            source: source // By default the source is the class name
              ? source.toUpperCase().substring(0, 1) + source.substring(1)
              : this.constructor.name,
            destination: destination.toUpperCase().substring(0, 1) +
              destination.substring(1),
            payload: payload,
          },
        }),
      );
    }, 0);
  }
}
