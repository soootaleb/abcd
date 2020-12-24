import type { IMessage } from "./interface.ts";

import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Net {
  private _peers: { [key: string]: { peerIp: string } } = {};
  private _clients: { [key: string]: { clientIp: string } } = {};
  private worker: Worker;
  private messages: Observe<IMessage>;

  public get peers() {
    return this._peers;
  }

  public get clients() {
    return this._clients;
  }

  public get quorum(): number {
    return Math.floor((Object.keys(this.peers).length + 1) / 2) + 1
  }

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    // START THE WORKER
    this.worker = new Worker(new URL("net.worker.ts", import.meta.url).href, {
      type: "module",
      deno: true,
    });

    // Push worker messages to queue
    // If destination is Net, message will be handled by messages.bind()
    this.worker.onmessage = (e: MessageEvent) => {
      this.messages.setValue(e.data);
    };

    // MESSAGES RECEIVED FROM QUEUE WILL GO EITHER TO
    // handleMessage if destination is NET
    // this.worker.postMessage if it's a peer, a client or "ui"
    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "net") {

        // Worker should no longer send messages to net
        this.handleMessage(message);
      } else if (
        Object.keys(this.peers).includes(message.destination) ||
        Object.keys(this.clients).includes(message.destination) ||
        message.destination === "ui" ||
        message.destination === "net.worker"
      ) {
        this.worker.postMessage(message);
      }
    });
  }

  /**
   * Method to handle message with destination NET
   * @param message message with destination == "net"
   */
  private handleMessage(
    message: IMessage<{
      clientIp: string,
      peerIp: string;
    }>, 
  ) {
    switch (message.type) {
      case "peerConnectionOpen":
        this.peers[message.payload.peerIp] = message.payload;
        this.messages.setValue({
          type: "peerConnectionOpen",
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "peerConnectionFailed":
      case "peerConnectionClose":
        delete this.peers[message.payload.peerIp];
        this.messages.setValue({
          type: "peerConnectionClose",
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "clientConnectionOpen":
        this.clients[message.payload.clientIp] = message.payload;
        this.messages.setValue({
          type: "clientConnectionOpen",
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "clientConnectionClose":
        delete this.clients[message.payload.peerIp];
        this.messages.setValue({
          type: "clientConnectionClose",
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "openPeerConnectionRequest":
        this.messages.setValue({
          type: "openPeerConnectionRequest",
          source: "net",
          destination: "net.worker",
          payload: message.payload,
        });
        break;
      case "openPeerConnectionComplete":
        this._peers[message.payload.peerIp] = {
          peerIp: message.payload.peerIp
        };
        this.messages.setValue({
          type: "peerAdded",
          source: "net",
          destination: "log",
          payload: message.payload,
        });
        break;
      default:
        this.messages.setValue({
          type: "invalidMessageType",
          source: "net",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
    }
  }
}
