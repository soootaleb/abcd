import type { IMessage } from "../interfaces/interface.ts";
import { EComponent, EMType } from "../enumeration.ts";
import { IMPayload } from "../interfaces/mpayload.ts";
import { H } from "../type.ts";

declare const self: Worker;

export default class DiscoveryWorker {

  private _server: Deno.DatagramConn;
  
  private token = Math.random().toString(36).substring(7);
  private encoder = new TextEncoder();
  private decoder = new TextDecoder("utf-8");
  private multicast: Deno.NetAddr = { port: 8888, transport: "udp", hostname: "224.0.0.1"};
  
  private knownTokens: string[] = [];

  private postMessage: <T extends EMType>(message: IMessage<T>) => void =
    self.postMessage;


  public get server(): Deno.DatagramConn {
    return this._server;
  }

  constructor() {
    this._server = Deno.listenDatagram({ port: 8888, transport: "udp", hostname: "0.0.0.0" })

    self.onmessage = this.onmessage;

    this.send(EMType.DiscoveryServerStarted, {
      token: this.token
    }, EComponent.Discovery);
  }
  
  private send<T extends EMType>(
    type: T,
    payload: IMPayload[T],
    destination: string,
  ) {
    this.postMessage({
      type: type,
      source: this.constructor.name,
      destination: destination.toUpperCase().substring(0, 1) + destination.substring(1),
      payload: payload,
    })
  }

  onmessage = (ev: MessageEvent<IMessage<EMType>>) => {
    const message = ev.data;
  
    const destination = message.destination;
  
    if (destination == EComponent.DiscoveryWorker) {
      // deno-lint-ignore no-this-alias no-explicit-any
      const self: any = this;
      if (Object.keys(this).includes(message.type)) {
        self[message.type](message);
      } else {
        this.send(
          EMType.LogMessage,
          { message: "Missing handler for " + message.type },
          EComponent.Logger,
        );
      }
    } else {
      this.send(EMType.LogMessage, {
        message: `Received message for ${message.destination}`
      }, EComponent.Logger);
    }
  };

  public datagram(datagram: [Uint8Array, Deno.Addr]) {
    const [data, addr] = datagram as [Uint8Array, Deno.NetAddr];

    if (this.decoder.decode(data) !== this.token && !this.knownTokens.includes(this.token)) {
      this.knownTokens.push(this.token);
      this.send(EMType.DiscoveryBeaconReceived, {
        addr: addr,
        token: this.decoder.decode(data)
      }, EComponent.Discovery)
    }
  }

  [EMType.DiscoveryBeaconSend]: H<EMType.DiscoveryBeaconSend> = (message) => {
    this.server.send(this.encoder.encode(this.token), this.multicast);
  }
}

const worker = new DiscoveryWorker();

for await (const datagram of worker.server) {
  worker.datagram(datagram);
}
