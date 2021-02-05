import Observe from "https://deno.land/x/Observe/Observe.ts";
import { IMessage } from "./interfaces/interface.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { IMPayload } from "./interfaces/mpayload.ts";

export default class Messenger extends Object {

    protected messages: Observe<IMessage<EMType>>;

    constructor(messages: Observe<IMessage<EMType>>) {
        super();

        this.messages = messages;

        this.messages.bind((message) => {
            if(message.destination === this.constructor.name) {
                // Yes, a bit ugly but...
                // Added deno lint ignore...
                // deno-lint-ignore no-explicit-any
                const self: any = this;
                if (this.hasOwnProperty(message.type)) {
                    self[message.type](message);
                } else {
                    this.send(EMType.LogMessage, { message: "Missing handler for " + message.type }, EComponent.Logger)
                }
            }
        })
    }

    protected send<T extends EMType>(type: T, payload: IMPayload[T], destination: EComponent | string, source?: string) {
        this.messages.setValue({
            type: type,
            source: source ? source.toUpperCase().substring(0, 1) + source.substring(1): this.constructor.name,
            destination: destination.toUpperCase().substring(0, 1) + destination.substring(1),
            payload: payload
        })
    }
}