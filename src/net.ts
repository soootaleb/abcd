import { IMessage } from "./interface.ts";

import Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Net {
  private _peers: { [key: string]: { peerPort: string } } = {};
  private _port: string = Deno.args[0] ? Deno.args[0] : "0";
  private worker: Worker;
  private messages: Observe<IMessage>;

  public get peers() {
    return this._peers;
  }

  public get port() {
    return this._port;
  }

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    // START THE WORKER
    this.worker = new Worker(new URL("./net.worker.ts", import.meta.url).href, {
      type: "module",
      deno: true,
    });

    // MESSAGE RECEIVED FROM WORKER WILL GO EITHER TO
    // handleMessage if destination is NET
    // this.messages otherwise
    this.worker.onmessage = (e: MessageEvent) => {
      const message: IMessage<any> = e.data;
      if (message.destination == "net") {
        this.handleMessage(message);
      } else if (Object.keys(this._peers).includes(message.destination)) {
        this.messages.setValue(e.data);
      } else if (this.port == message.destination) {
        this.messages.setValue(message);
      }
    };

    // MESSAGES RECEIVED FROM QUEUE WILL GO EITHER TO
    // handleMessage if destination is NET
    // this.worker.postMessage if destination is a peer
    // Nowhere otherwise
    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "net") {
        this.handleMessage(message);
      } else if (
        Object.keys(this._peers).includes(message.destination) ||
        message.destination == "ui"
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
      port: string;
      connectedTo: { peerPort: string };
      peerPort: string;
    }>, 
  ) {
    switch (message.type) {
      case "newConnection":
        this._peers[message.payload.peerPort] = message.payload;
        this.messages.setValue({
          type: message.type,
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "peerConnectionLost":
        delete this.peers[message.payload.peerPort];
        this.messages.setValue({
          type: message.type,
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "serverStarted":
        this._port = message.payload.port.toString();
        this.messages.setValue({
          type: message.type,
          source: "net",
          destination: "node",
          payload: message.payload,
        });
        break;
      case "connectToPeer":
        this.worker.postMessage({
          type: "connectToPeer",
          source: "net",
          destination: "worker",
          payload: message.payload,
        });
        break;
      case "peerConnectionComplete":
        this._peers[message.payload.connectedTo.peerPort] =
          message.payload.connectedTo;
        this.messages.setValue({
          type: "peerAdded",
          source: "net",
          destination: "log",
          payload: message.payload,
        });
        break;
      case "invalidMessageDestination":
        this.messages.setValue({
          ...message,
          source: "net",
          destination: "log",
        });
        break;
      case "peerConnectionExists":
        this.messages.setValue({
          type: "peerConnectionExists",
          source: "net",
          destination: "log",
          payload: {
            peerPort: message.payload.peerPort,
          },
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
