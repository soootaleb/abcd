import type { IKeyValue, ILog, IMessage, IOPayload } from "../src/interfaces/interface.ts";
import { EKVOpType, EMonOpType, EMType, EOpType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Client {

    public static DEFAULT_SERVER_ADDR = "127.0.01"
    public static DEFAULT_SERVER_PORT = 8080

    private _server = {
        addr: Client.DEFAULT_SERVER_ADDR,
        port: Client.DEFAULT_SERVER_PORT
    }

    private get endpoint() {
        const protocol = this._server.port === 443 ? "wss" : "ws";
        return `${protocol}://` + this._server.addr + ":" + this._server.port + "/client"
    }

    private ws: WebSocket;

    private _requests: {
        [key: string]: (value: IMessage<EMType.ClientResponse>) => void
    } = {};

    private _watchers: {
        [key: string]: (notification: IMessage<EMType.ClientNotification>) => void
    } = {};

    private _connection: {
        promise: Promise<Client>,
        resolve: (client: Client) => void
    } = {} as {
        promise: Promise<Client>,
        resolve: (client: Client) => void
    };

    public get co(): Promise<Client> {
        return this._connection.promise
    }

    constructor(addr: string = Client.DEFAULT_SERVER_ADDR, port: number = Client.DEFAULT_SERVER_PORT) {
        this._server.addr = addr;
        this._server.port = port;

        this.ws = new WebSocket(this.endpoint);

        this._connection.promise = new Promise(resolve => this._connection.resolve = resolve);
        
        this.ws.onopen = ((_) => {
            this._connection.resolve(this);
        })

        this.ws.onmessage = (ev: MessageEvent) => {
            const message = JSON.parse(ev.data);
            // deno-lint-ignore no-explicit-any no-this-alias
            const self: any = this;
            if (Object.keys(this).includes(message.type)) {
                self[message.type]({
                    ...message,
                    source: this._server.addr,
                    destination: "Client"
                });
            } else {
                console.warn('Missing handler for message', message)
            }
        };
    }

    private send<T extends EOpType>(type:  T, payload: IOPayload[T]): Promise<IMessage<EMType.ClientResponse>> {

        const token = Math.random().toString(36).substr(2);

        this.ws.send(JSON.stringify({
            type: EMType.ClientRequest,
            source: "Client",
            destination: this._server.addr,
            payload: {
                token: token,
                type: type,
                payload: payload,
                timestamp: new Date().getTime()
            }
        }))

        return new Promise(resolve => {
            this._requests[token] = resolve;
        })
    }

    [EMType.ClientResponse]: H<EMType.ClientResponse> = (message) => {
        if(Object.keys(this._requests).includes(message.payload.token)) {
            this._requests[message.payload.token](message)
            delete this._requests[message.payload.token]
        }
    }

    [EMType.ClientNotification]: H<EMType.ClientNotification> = (message) => {
        if(message.payload.type === EOpType.KVWatch) {
            const payload = message.payload.payload as ILog
            if(Object.keys(this._watchers).includes(payload.next.key)) {
                this._watchers[payload.next.key](message);
            }
        } else if (message.payload.type === EOpType.MonWatch) {
            const payload = message.payload.payload as IKeyValue
            if(Object.keys(this._watchers).includes(payload.key)) {
                this._watchers[payload.key](message);
            }
        }
    }

    public kvop(op: EKVOpType, key: string, value?: string) {
        return this.send(EOpType.KVOp, {
            op: op,
            kv: {
                key: key,
                value: value,
            }
        })
    }

    public kvwatch(key: string, expire = 1, callback: (notification: IMessage<EMType.ClientNotification>) => void) {

        this._watchers[key] = callback;

        this.send(EOpType.KVWatch, {
            key: key,
            expire: expire
        })
    }

    public monop(op: EMonOpType, key: string, value?: string) {
        return this.send(EOpType.MonOp, {
            op: op,
            metric: {
                key: key,
                value: value,
            }
        })
    }

    public monwatch(key: string, expire = 1, callback: (notification: IMessage<EMType.ClientNotification>) => void) {

        this._watchers[key] = callback;

        this.send(EOpType.MonWatch, {
            key: key,
            expire: expire
        })
    }
}