import type { IState } from "./interfaces/interface.ts";
import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Net extends Messenger {

  constructor(private state: IState) {
    super();
  }

  private workerForward = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const worker: Worker = this.worker as Worker;
    worker.postMessage(event.detail);
  }

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    this.state.net.peers[message.payload.peerIp] = message.payload;
    addEventListener(message.payload.peerIp, this.workerForward);
    this.send(message.type, message.payload, EComponent.Node);
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionFail> = (message) => {
    removeEventListener(message.payload.peerIp, this.workerForward);
  };

  [EMType.PeerConnectionFail]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.state.net.peers[message.payload.peerIp];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionFail> = (message) => {
    delete this.state.net.peers[message.payload.peerIp];
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = (message) => {
    this.state.net.clients[message.payload.clientIp] = message.payload;
    addEventListener(message.payload.clientIp, this.workerForward);
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (
    message,
  ) => {
    delete this.state.net.clients[message.payload.clientIp];
    this.send(message.type, message.payload, EComponent.Monitor);
    removeEventListener(message.payload.clientIp, this.workerForward);
  };

  [EMType.PeerConnectionRequest]: H<EMType.PeerConnectionRequest> = (
    message,
  ) => {
    this.send(message.type, message.payload, EComponent.NetWorker);
  };

  [EMType.PeerConnectionComplete]: H<EMType.PeerConnectionComplete> = (
    message,
  ) => {
    this.state.net.peers[message.payload.peerIp] = {
      peerIp: message.payload.peerIp,
    };
    addEventListener(message.payload.peerIp, this.workerForward);
    this.send(message.type, message.payload, EComponent.Logger);
  };

  [EMType.PeerServerStarted]: H<EMType.PeerServerStarted> = (message) => {
    this.state.net.ready = true;
    this.send(message.type, message.payload, EComponent.Node);
  };
}
