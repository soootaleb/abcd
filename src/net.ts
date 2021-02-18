import type { IMessage } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Net extends Messenger {
  private _ready = false;
  private _peers: { [key: string]: { peerIp: string } } = {};
  private _clients: { [key: string]: { clientIp: string } } = {};

  private worker: Worker;

  public get ready() {
    return this._ready;
  }

  public get peers() {
    return this._peers;
  }

  public get clients() {
    return this._clients;
  }

  public get quorum(): number {
    return Math.floor((Object.keys(this.peers).length + 1) / 2) + 1;
  }

  constructor() {
    super();

    // START THE WORKER
    this.worker = new Worker(
      new URL('.', import.meta.url).href + 'workers/net.worker.ts',
      {
        type: "module",
        deno: true,
      },
    );

    // Push worker messages to queue
    // If destination is Net, message will be handled by messages.bind()
    this.worker.onmessage = (ev: MessageEvent) => {
      const message: IMessage<EMType> = ev.data;
      this.send(
        message.type,
        message.payload,
        message.destination,
        message.source,
      );
    };

    addEventListener(EComponent.NetWorker, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      this.worker.postMessage(event.detail);
    });
  }

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    this.peers[message.payload.peerIp] = message.payload;
    addEventListener(message.payload.peerIp, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      this.worker.postMessage(event.detail);
    });
    this.send(message.type, message.payload, EComponent.Node);
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.PeerConnectionFail]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.peers[message.payload.peerIp];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.peers[message.payload.peerIp];
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = (message) => {
    this.clients[message.payload.clientIp] = message.payload;
    addEventListener(message.payload.clientIp, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      this.worker.postMessage(event.detail);
    });
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (
    message,
  ) => {
    delete this.clients[message.payload.clientIp];
    this.send(message.type, message.payload, EComponent.Monitor);
  };

  [EMType.PeerConnectionRequest]: H<EMType.PeerConnectionRequest> = (
    message,
  ) => {
    this.send(message.type, message.payload, EComponent.NetWorker);
  };

  [EMType.PeerConnectionComplete]: H<EMType.PeerConnectionComplete> = (
    message,
  ) => {
    this._peers[message.payload.peerIp] = {
      peerIp: message.payload.peerIp,
    };
    addEventListener(message.payload.peerIp, (ev: Event) => {
      const event: CustomEvent = ev as CustomEvent;
      this.worker.postMessage(event.detail);
    });
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.PeerServerStarted]: H<EMType.PeerServerStarted> = (message) => {
    this._ready = true;
    this.send(message.type, message.payload, EComponent.Node);
  };
}
