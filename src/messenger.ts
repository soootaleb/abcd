// deno-lint-ignore-file no-explicit-any
import Observe from "https://deno.land/x/Observe/Observe.ts";
import { IMessage, IMPayload } from "./interface.ts";
import { EMTypes } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Messenger extends Object {

    private messages: Observe<IMessage<EMTypes>>;

    constructor(messages: Observe<IMessage<EMTypes>>) {
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
                    this.send(EMTypes.LogMessage, { message: "Missing handler for " + message.type }, "Log")
                }
            }
        })
    }

    protected send<T extends EMTypes>(type: T, payload: IMPayload[T], destination: string) {
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
 * - declares [EMTypes.MType] to handle typed messages
 */
class Node extends Messenger {

    constructor(messages: Observe<IMessage<EMTypes>>) {
        super(messages);
    }

    protected [EMTypes.Ping]: H<EMTypes.Ping> = (message) => {
        this.send(EMTypes.Pong, null, message.source);
    }
}

class Net extends Messenger {
    constructor(messages: Observe<IMessage<EMTypes>>) {
        super(messages);
    }

    [EMTypes.Pong]: H<EMTypes.Pong> = (message) => {
        this.send(EMTypes.LogMessage, {
            message: "Received pong from " + message.source
        }, "Log")
    }

    public ping() {
        this.send(EMTypes.Ping, null, "Node")
    }
}

// // Init messages
// const messages = new Observe({
//     type: EMTypes.InitialMessage,
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

