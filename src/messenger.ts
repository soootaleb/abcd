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
  protected worker: Worker | undefined;

  constructor(protected state: IState) {
    super();

    // Messenger components subscribe to events of their class name
    // That's why EComponent must have the same names as the messengers
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

    const workerfile = new URL(".", import.meta.url).href +
    `workers/${this.constructor.name.toLowerCase()}.worker.ts`;

    // If we detect a worker file, start & register it
    if (Object.keys(EComponent).includes(this.constructor.name + "Worker")) {
      // START THE WORKER
      this.worker = new Worker(workerfile, { type: "module", deno: true });

      // Push worker messages to queue
      // If destination is Net, message will be handled by messages.bind()
      const worker: Worker = this.worker as Worker;
      worker.onmessage = (ev: MessageEvent) => {
        const message: IMessage<EMType> = ev.data;
        this.send(
          message.type,
          message.payload,
          message.destination,
          message.source,
        );
      };

      addEventListener(this.constructor.name + "Worker", (ev: Event) => {
        const event: CustomEvent = ev as CustomEvent;
        const worker: Worker = this.worker as Worker;
        worker.postMessage(event.detail);
      });

      this.send(EMType.LogMessage, {
        message: `Registered ${this.constructor.name + "Worker"}`,
      }, EComponent.Logger);
    }
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
  }
}
