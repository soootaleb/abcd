// deno-lint-ignore-file no-explicit-any
import Observe from "https://deno.land/x/Observe/Observe.ts";

enum MT {
    Ping = "Ping",
    Pong = "Pong",
    LogMessage = "LogMessage",
    InitialMessage = "InitialMessage",
    MessageRequest = "MessageRequest",
    MessageResponse = "MessageResponse",
}

/**
 * List MessageTypes along with their Payloads
 */
type Mapping = {
    [MT.Pong]: null, // Empty payloads...
    [MT.Ping]: null, // Empty payloads...
    [MT.InitialMessage]: null,
    [MT.LogMessage]: { message: string } // Simple payloads
    [MT.MessageRequest]: {
        key: string,
        value: string
        token: string,
        complex: Mapping[MT.MessageResponse] // A message can contain the payload of another type
    }
    [MT.MessageResponse]: {
        value: string,
        token: boolean
    }
}

/**
 * This doesn't seem to work as intended (check messages type)
 */
type Message<T extends keyof Mapping> = {
    type: T,
    source: string,
    destination: string,
    payload: Mapping[T]
}

/**
 * Verify extends vs in keyof, ...
 */
type H<T extends MT> = (message: Message<T>) => void

class Messenger extends Object {

    /**
     * Doesn't seem to work as intended (check the constructor, payload doesn't match MType)
     * !!! Take a time to console.log(messages), very interesting props
     */
    private messages: Observe<Message<MT>>;


    constructor(messages: Observe<Message<keyof Mapping>>) {
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
                    this.send(MT.LogMessage, { message: "Missing handler for " + message.type }, "Log")
                }
            }
        })
    }

    protected send<T extends MT>(type: T, payload: Mapping[T], destination: string) {
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
 * - declares [MT.MType] to handle typed messages
 */
class Node extends Messenger {

    constructor(messages: Observe<Message<MT>>) {
        super(messages);
    }

    protected [MT.Ping]: H<MT.Ping> = (message) => {
        this.send(MT.Pong, null, message.source);
    }
}

class Net extends Messenger {
    constructor(messages: Observe<Message<MT>>) {
        super(messages);
    }

    [MT.Pong]: H<MT.Pong> = (message) => {
        this.send(MT.LogMessage, {
            message: "Received pong from " + message.source
        }, "Log")
    }

    public ping() {
        this.send(MT.Ping, null, "Node")
    }
}

// Init messages
const messages = new Observe({
    type: MT.InitialMessage,
    source: "Root",
    destination: "Log",
    payload: null
});

// Logger will be OK
messages.bind((message) => {
    console.log(message)
})

// Pass messages to components
const node = new Node(messages);
const net = new Net(messages)

// Enjoy...
net.ping();

