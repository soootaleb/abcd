import type { IMessage } from "./interfaces/interface.ts";

import type Observe from "https://deno.land/x/Observe/Observe.ts";
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

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

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

    // MESSAGES RECEIVED FROM QUEUE WILL GO EITHER TO
    // handleMessage if destination is NET
    // this.worker.postMessage if it's a peer, a client or "ui"
    this.messages.bind((message) => {
      if (
        Object.keys(this.peers).includes(message.destination) ||
        Object.keys(this.clients).includes(message.destination) ||
        message.destination === "Ui" ||
        message.destination === EComponent.NetWorker
      ) {
        this.worker.postMessage(message);
      }
    });
  }

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    this.peers[message.payload.peerIp] = message.payload;
    this.send(message.type, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionFail]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.peers[message.payload.peerIp];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.peers[message.payload.peerIp];
    this.send(message.type, message.payload, EComponent.Node);
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = (message) => {
    this.clients[message.payload.clientIp] = message.payload;
    this.send(message.type, message.payload, EComponent.Node);
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
    this.send(EMType.PeerAdded, message.payload, EComponent.Logger);
  };

  [EMType.PeerServerStarted]: H<EMType.PeerServerStarted> = (message) => {
    this._ready = true;
    this.send(message.type, message.payload, EComponent.Node);
  };
}
