import Observe from "https://deno.land/x/Observe/Observe.ts";

enum MT {
    Ping = "Ping",
    LogMessage = "LogMessage",
    InitialMessage = "InitialMessage",
    MessageRequest = "MessageRequest",
    MessageResponse = "MessageResponse",
}

/**
 * List MessageTypes along with their Payloads
 */
type Mapping = {
    [MT.Ping]: {},
    [MT.InitialMessage]: {},
    [MT.LogMessage]: { message: string }
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

type H<T extends MT> = (message: Message<T>) => void

/**
 * Generic send()
 * - Ensures the type is from Mapping (autocomplete)
 * - Ensures the payload is the correct one
 * - Automates the definition or source
 */
class IO extends Object {

    /**
     * Doesn't seem to work as intended (check the constructor, payload doesn't match MType)
     */
    private messages: Observe<Message<keyof Mapping>>;

    // protected handlers: {
    //     [key in MT]?: H<key>
    // } = {}

    /**
     * Trying very hard to declare keys of type MType associated with Handlers (like in a type)
     * This to avoid duplication of MType in property name along with typing the property
     * For now duplication is mandatory to get typing of message in callback
     */
    // [Symbol.for(key in MT)]: {};

    constructor(messages: Observe<Message<keyof Mapping>>) {
        super();

        this.messages = messages;

        this.messages.bind((message) => {
            if(message.destination === this.constructor.name) {
                // Yes, a bit ugly but...
                const self: any = this;
                if (self.hasOwnProperty(message.type)) {
                    self[message.type](message);
                } else {
                    this.send(MT.LogMessage, { message: "Missing handler for " + message.type }, "Log")
                }
            }
        })
    }

    protected send<T extends keyof Mapping>(type: T, payload: Mapping[T], destination: string) {
        const message = {
            type: type,
            source: this.constructor.name,
            destination: destination.toUpperCase().substring(0, 1) + destination.substring(1),
            payload: payload
        };
        console.log("[SENDING]", message)
        this.messages.setValue(message)
    }

    /**
     * Each .receive() must be called during object initialization
     * Hence, .receive() would be used in methods & those methods would stack in the constructor
     * @param type 
     * @param callback 
     */
    // protected receive<T extends keyof Mapping>(type: T, callback: (message: {
    //     type: T,
    //     source: string,
    //     destination: string,
    //     payload: Mapping[T]
    // }) => void) {
    //     // What ?
    //     // Registering the callback OK
    //     // But most importantly, .receive() must be called (registered)
    // }
}

/**
 * Extend IO & call this.send(MType, Payload, Destination)
 * - MessageType is forced (+ autocomplete)
 * - MessagePayload is aligned with message type
 * - Destination is just after, non-intrusive
 */
class Node extends IO {

    constructor(messages: Observe<Message<keyof Mapping>>) {
        super(messages);

        /**
         * With this approach I have to call this.receive() for each MessageType
         */
        // this.receive(MT.MessageRequest, (message) => {
        //     console.log("Received typed message", message);
        //     console.log("Message from ", message.source);
        //     console.log("Payload contains ", message.payload.complex)
        // })
    }

    /**
     * Ideally, no call is needed;
     * However, MessageType is duplicated & must be SYNC
     */
    // protected handlers: { [key in MT]?: H<key> } = {

    //     // This is automatically called by parent IO in case of MessageType & Destintation match
    //     [MT.MessageRequest]: (message) => {

    //         console.log(this.isPrototypeOf({})) // Just to check this access
    //         console.log("Message from ", message.source);
    //         console.log("Payload contains ", message.payload.complex)

    //     }

    // }

    /**
     * This is a better way
     * still duplication
     * but not in a "handler" object
     * 
     * /!!!\ this.messages has VERY INTERESTING PROPS (history, eventID, boundCallbacks, current, ...)
     */
    protected [MT.LogMessage]: H<MT.LogMessage> = (message) => {
        console.log("[RECEIVED]", {
            self: this,
            message: message.payload.message,
            complete: message
        })
    }

    public ping() {
        this.send(MT.Ping, {}, "Store")
    }

}

/**
 * VERY GOOD WAY TO TYPE THE SENDING OF A MESSAGE
 * - WHAT'S THE EQUIVALENT FOR RECEIVING MESSAGE?
 * - HOW TO MAKE SURE SENDING & RECEIVING ARE ALIGNED?
 */
class Store extends IO {
    constructor(messages: Observe<Message<keyof Mapping>>) {
        super(messages);
        this.send(MT.LogMessage, { message: "Howdie !" }, "node")
    }

    protected [MT.Ping]: H<MT.Ping> = (message) => {
        this.send(MT.Ping, {}, "Node")
    }
}

// function receive(type: keyof Mapping) {
//     return (proto: Object, method: string, descriptor: PropertyDescriptor) => {
//         descriptor.value = function(...args: any[]) {
//             console.log(proto, method, descriptor, args, type)
//             return descriptor.value.apply(this, args);
//         }
//     }
// }

const messages = new Observe({
    type: MT.LogMessage,
    source: "Root",
    destination: "Store",
    payload: {},
});

const node = new Node(messages);
const store = new Store(messages)

setTimeout(() => {
    node.ping()
}, 1000)

