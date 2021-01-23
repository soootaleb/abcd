import type { ILog, IMessage } from "../src/interface.ts";

class Client {

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

    private ws: WebSocket; // = new WebSocket(this.endpoint);

    private _requests: { [key: string]: any } = {};
    public _connection: any = {};

    public get co(): Promise<Client> {
        return this._connection.promise
    }

    constructor(addr: string = Client.DEFAULT_SERVER_ADDR, port: number = Client.DEFAULT_SERVER_PORT) {
        this._server.addr = addr;
        this._server.port = port;

        this.ws = new WebSocket(this.endpoint);

        this._connection.promise = new Promise(resolve => this._connection.resolve = resolve);
        
        this.ws.onopen = ((ev: Event) => {
            this._connection.resolve(this);
        })

        this.ws.onmessage = ((ev) => {
            const message = JSON.parse(ev.data);
            if(Object.keys(this._requests).includes(message.payload.token)) {
                this._requests[message.payload.token](message)
                delete this._requests[message.payload.token]
            }
        })
    }

    private async send<T = unknown>(type:  string, payload: any = {}): Promise<IMessage<{
        timestamp: number,
        token: string,
        response: T
    }>> {

        const token = Math.random().toString(36).substr(2);

        this.ws.send(JSON.stringify({
            type: "clientRequest",
            source: "client",
            destination: this._server.addr,
            payload: {
                token: token,
                request: {
                    type: type,
                    source: "client",
                    destination: this._server.addr,
                    payload: payload
                },
                timestamp: new Date().getTime()
            }
        }))

        return new Promise(resolve => {
            this._requests[token] = resolve;
        })
    }

    public async kvop(op: string, key: string, value?: string): Promise<IMessage<ILog>> {
        return this.send<IMessage<ILog>>("KVOpRequest",{
            key: "random-key",
            value: "random-value",
            op: "put"
        }).then((message) => ({
            ...message.payload.response,
            source: this._server.addr,
            destination: "client"
        }))
    }
}

// const client = await new Client("192.168.64.2").co;

// client.kvop("put", "random-key", "some-value")
//     .then((response: IMessage<ILog>) => {
//         console.log(response);
//     })