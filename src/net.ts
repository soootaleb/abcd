import Messenger from "./messenger.ts";
import { EComponent, EMType } from "./enumeration.ts";
import { H } from "./type.ts";
import {
  serve,
  Server,
  ServerRequest,
} from "https://deno.land/std/http/server.ts";
import { IMessage, IState } from "./interfaces/interface.ts";
import {
  acceptWebSocket,
  WebSocket as DenoWS,
} from "https://deno.land/std/ws/mod.ts";

export default class Net extends Messenger {
  private _server: Server;
  private _psockets: {
    [key: string]: DenoWS | WebSocket
  } = {};
  private _csockets: {
    [key: string]: DenoWS
  } = {};

  constructor(protected state: IState) {
    super(state);

    this._server = serve({
      hostname: "0.0.0.0",
      port: 8080,
    });

    this.state.net.ready = true;
    this.send(EMType.PeerServerStarted, this.server.listener.addr, EComponent.Node);
  }

  public get server(): Server {
    return this._server;
  }

  [EMType.PeerConnectionOpen]: H<EMType.PeerConnectionOpen> = (message) => {
    this.state.net.peers[message.payload.peerIp] = message.payload;
    addEventListener(message.payload.peerIp, this.onmessage);
    this.send(EMType.PeerConnectionOpen, message.payload, EComponent.Logger);
    this.send(EMType.PeerConnectionOpen, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionFail]: H<EMType.PeerConnectionFail> = (message) => {
    removeEventListener(message.payload.peerIp, this.onmessage);
    delete this.state.net.peers[message.payload.peerIp];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionFail> = (message) => {
    removeEventListener(message.payload.peerIp, this.onmessage);
    delete this.state.net.peers[message.payload.peerIp];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionRequest]: H<EMType.PeerConnectionRequest> = (
    message,
  ) => {
    if (this.state.net.peers[message.payload.peerIp]) {
      this.send(EMType.PeerConnectionFail, {
        peerIp: message.payload.peerIp,
      }, EComponent.Logger);
    } else {
      const sock = new WebSocket(`ws://${message.payload.peerIp}:8080/peer`);
      this._psockets[message.payload.peerIp] = sock;
      this.state.net.peers[message.payload.peerIp] = {
        peerIp: message.payload.peerIp
      };

      sock.onopen = () => {
        addEventListener(message.payload.peerIp, this.onmessage);
        this.send(EMType.PeerConnectionSuccess, {
          peerIp: message.payload.peerIp,
        }, EComponent.Logger);
      };

      sock.onmessage = (ev: MessageEvent<string>) => {
        const msg = JSON.parse(ev.data) as IMessage<EMType>;
        this.send(msg.type, msg.payload, EComponent.Node, message.payload.peerIp);
      };

      sock.onclose = (_: CloseEvent) => {
        if (this.state.net.peers[message.payload.peerIp]) {
          delete this.state.net.peers[message.payload.peerIp];
          this.send(EMType.PeerConnectionClose, {
            peerIp: message.payload.peerIp,
          }, EComponent.Net);
        } else {
          this.send(EMType.PeerConnectionFail, {
            peerIp: message.payload.peerIp,
          }, EComponent.Net);
        }
      };

      this.send(EMType.PeerConnectionPending, {
        peerIp: message.payload.peerIp,
      }, EComponent.Logger);
    }
  };

  public request(request: ServerRequest): void {
    const { conn, r: bufReader, w: bufWriter, headers } = request;

    if (request.url === "/discovery") {
      this.send(
        EMType.DiscoveryEndpointCalled,
        request.conn.remoteAddr,
        EComponent.Logger,
      );
      request.respond({
        status: 200,
        body: Deno.env.get("ABCD_NODE_IP"),
      });
    } else if (request.url === "/ready") {
      request.respond({
        status: this.state.ready ? 200 : 500,
        body: this.state.ready ? "OK" : "KO",
      });
    } else {
      acceptWebSocket({
        conn,
        bufReader,
        bufWriter,
        headers,
      }).then(async (sock: DenoWS) => {
        const remoteAddr: Deno.NetAddr = request.conn
          .remoteAddr as Deno.NetAddr;
        const hostname: string = remoteAddr.hostname + "-" + request.conn.rid;

        if (request.url === "/client") {

          this.state.net.clients[hostname] = {
            clientIp: hostname,
            remoteAddr: remoteAddr,
            clientId: request.conn.rid
          };

          addEventListener(hostname, this.onmessage);

          this._csockets[hostname] = sock;

          this.send(EMType.ClientConnectionOpen, {
            clientIp: hostname,
            remoteAddr: remoteAddr,
            clientId: request.conn.rid
          }, EComponent.Logger);

          for await (const ev of sock) {
            if (typeof ev === "string") {
              const msg = JSON.parse(ev) as IMessage<EMType>;
              this.send(msg.type, msg.payload, EComponent.Api, hostname);
            }
          }

          delete this._csockets[hostname];
          delete this.state.net.clients[hostname];

          this.send(EMType.ClientConnectionClose, {
            clientIp: hostname,
          }, EComponent.Api);
          
          this.send(EMType.ClientConnectionClose, {
            clientIp: hostname,
          }, EComponent.Logger);

          removeEventListener(hostname, this.onmessage);

        } else if (request.url === "/peer") {

          this._psockets[hostname] = sock;

          this.send(EMType.PeerConnectionOpen, {
            peerIp: hostname
          }, EComponent.Net);

          for await (const ev of sock) {
            if (typeof ev === "string") {
              const msg = JSON.parse(ev) as IMessage<EMType>;
              this.send(msg.type, msg.payload, EComponent.Node, hostname);
            }
          }

          delete this._psockets[hostname];
          delete this.state.net.peers[hostname];

          this.send(EMType.PeerConnectionClose, {
            peerIp: hostname,
          }, EComponent.Net);
        }
      }).catch((_) => {
        this.send(EMType.LogMessage, {
          message: `Received invalid request on ${request.url}`,
        }, EComponent.Logger);
      });
    }
  }

  private onmessage = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message = event.detail;
    const destination = message.destination;

    // If it's a peer, send it to peer
    if (Object.keys(this.state.net.peers).includes(destination)) {
      console.log(destination)
      this._psockets[destination].send(JSON.stringify(message));

      // If it's a client, send it to client
    } else if (Object.keys(this.state.net.clients).includes(destination)) {
      this._csockets[destination].send(JSON.stringify(message)).catch((_) => {
        this.send(EMType.LogMessage, {
          message: `Failed to send message to ${destination}`,
        }, EComponent.Logger);
        delete this.state.net.clients[destination];
      });

      // If it's "worker", handle message here
    } else if (destination == EComponent.NetWorker) {
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
      this.send(EMType.InvalidMessageDestination, {
        invalidMessageDestination: destination,
        availablePeers: Object.keys(this.state.net.peers),
        availableClients: Object.keys(this.state.net.clients),
        message: message,
      }, EComponent.Logger);
    }
  };
}
