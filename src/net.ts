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
    addEventListener(message.payload.peerIp, this.sendOnNetwork);
    this.send(EMType.PeerConnectionOpen, message.payload, EComponent.Logger);
    this.send(EMType.PeerConnectionOpen, message.payload, EComponent.Node);
  };

  [EMType.ClientConnectionOpen]: H<EMType.ClientConnectionOpen> = (message) => {
    this.state.net.clients[message.payload.clientIp] = message.payload;
    addEventListener(message.payload.clientIp, this.sendOnNetwork);
    this.send(EMType.ClientConnectionOpen, message.payload, EComponent.Logger);
    this.send(EMType.ClientConnectionOpen, message.payload, EComponent.Node);
  };

  [EMType.PeerConnectionFail]: H<EMType.PeerConnectionFail> = (message) => {
    removeEventListener(message.payload.peerIp, this.sendOnNetwork);
    delete this._psockets[message.payload.peerIp];
    delete this.state.net.peers[message.payload.peerIp];
  };

  [EMType.PeerConnectionClose]: H<EMType.PeerConnectionClose> = (message) => {
    removeEventListener(message.payload, this.sendOnNetwork);
    delete this._psockets[message.payload];
    delete this.state.net.peers[message.payload];
    this.send(EMType.PeerConnectionClose, message.payload, EComponent.Logger);
  };

  [EMType.ClientConnectionClose]: H<EMType.ClientConnectionClose> = (message) => {
    removeEventListener(message.payload, this.sendOnNetwork);
    delete this._csockets[message.payload];
    delete this.state.net.peers[message.payload];
    this.send(EMType.ClientConnectionClose, message.payload, EComponent.Api);
    this.send(EMType.ClientConnectionClose, message.payload, EComponent.Logger);
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
        addEventListener(message.payload.peerIp, this.sendOnNetwork);
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
          this.send(EMType.PeerConnectionClose,  message.payload.peerIp, EComponent.Net);
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

          this._csockets[hostname] = sock;

          this.send(EMType.ClientConnectionOpen, {
            clientIp: hostname,
            remoteAddr: remoteAddr,
            clientId: request.conn.rid
          }, EComponent.Net);

          for await (const ev of sock) {
            if (typeof ev === "string") {
              const msg = JSON.parse(ev) as IMessage<EMType>;
              this.send(msg.type, msg.payload, EComponent.Api, hostname);
            }
          }
          
          this.send(EMType.ClientConnectionClose, hostname, EComponent.Net);

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

          this.send(EMType.PeerConnectionClose, hostname, EComponent.Net);
        }
      }).catch((_) => {
        this.send(EMType.LogMessage, {
          message: `Received invalid request on ${request.url}`,
        }, EComponent.Logger);
      });
    }
  }

  private sendOnNetwork = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message = event.detail;
    const destination = message.destination;

    if (Object.keys(this.state.net.peers).includes(destination)) {
      this._psockets[destination].send(JSON.stringify(message));
    } else if (Object.keys(this.state.net.clients).includes(destination)) {
      this._csockets[destination].send(JSON.stringify(message))
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
