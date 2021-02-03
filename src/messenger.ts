// deno-lint-ignore-file no-explicit-any
import Observe from "https://deno.land/x/Observe/Observe.ts";
import { IMessage } from "./interfaces/interface.ts";
import { EMType } from "./enumeration.ts";
import { H } from "./type.ts";
import { IMPayload } from "./interfaces/mpayload.ts";

export default class Messenger extends Object {

    private messages: Observe<IMessage<EMType>>;

    constructor(messages: Observe<IMessage<EMType>>) {
        super();

        this.messages = messages;

        this.messages.bind((message) => {
            if(message.destination === this.constructor.name) {
                // Yes, a bit ugly but...
                // Added deno lint ignore...
                const self: any = this;
                if (self.hasOwnProperty(message.type)) {
                    self[message.type](message);
                } else {
                    this.send(EMType.LogMessage, { message: "Missing handler for " + message.type }, "Log")
                }
            }
        })
    }

    protected send<T extends EMType>(type: T, payload: IMPayload[T], destination: string) {
        this.messages.setValue({
            type: type,
            source: this.constructor.name,
            destination: destination.toUpperCase().substring(0, 1) + destination.substring(1),
            payload: payload
        })
    }
}

/**
 * A components extends IO
 * - uses this.send() to send typed messages
 * - declares [EMType.MType] to handle typed messages
 */
class Node extends Messenger {

    constructor(messages: Observe<IMessage<EMType>>) {
        super(messages);
    }

    protected [EMType.InitialMessage]: H<EMType.InitialMessage> = (message) => {
        this.send(EMType.InitialMessage, null, message.source);
    }
}

class Net extends Messenger {
    constructor(messages: Observe<IMessage<EMType>>) {
        super(messages);
    }

    [EMType.InitialMessage]: H<EMType.InitialMessage> = (message) => {
        this.send(EMType.LogMessage, {
            message: "Received pong from " + message.source
        }, "Log")
    }

    public ping() {
        this.send(EMType.InitialMessage, null, "Node")
    }
}

// // Init messages
// const messages = new Observe({
//     type: EMType.InitialMessage,
//     source: "Root",
//     destination: "Log",
//     payload: null
// });

// // Logger will be OK
// messages.bind((message) => {
//     console.log(message)
// })

// // Pass messages to components
// const node = new Node(messages);
// const net = new Net(messages)

// // Enjoy...
// net.ping();

