import { serve, Server, ServerRequest } from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  WebSocket as DenoWS,
} from "https://deno.land/std/ws/mod.ts";
import type { IMessage } from "../interfaces/interface.ts";
import { EMType, EOpType } from "../enumeration.ts";
import { H } from "../type.ts";
import { IMPayload } from "../interfaces/mpayload.ts";

declare const self: Worker;

export default class NetWorker {
  private _server: Server;
  private _ready = false;
  private uis: DenoWS[] = [];
  private peers: { [key: string]: DenoWS | WebSocket } = {};
  private clients: { [key: string]: DenoWS } = {};

  private postMessage: <T extends EMType>(message: IMessage<T>) => void =
    self.postMessage;

  public get server(): Server {
    return this._server;
  }

  public get ready(): boolean {
    return this._ready;
  }

  constructor() {
    this._server = serve({
      hostname: "0.0.0.0",
      port: 8080,
    });

    self.onmessage = this.onmessage;

    this.send(EMType.PeerServerStarted, this.server.listener.addr, "Net");
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
    });
  }

  public request(request: ServerRequest): void {
    const { conn, r: bufReader, w: bufWriter, headers } = request;

    if (request.url === "/discovery") {
      worker.send(
        EMType.DiscoveryEndpointCalled,
        request.conn.remoteAddr,
        "Logger",
      );
      request.respond({
        status: 200,
        body: Deno.env.get("ABCD_NODE_IP"),
      });
    } else if (request.url === "/ready") {
      request.respond({
        status: worker.ready ? 200 : 500,
        body: worker.ready ? "OK" : "KO",
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
        const hostname: string = remoteAddr.hostname;

        if (request.url === "/client") {
          this.clients[hostname] = sock;

          this.send(EMType.ClientConnectionOpen, {
            clientIp: hostname,
            remoteAddr: remoteAddr,
            clientId: request.conn.rid,
          }, "Net");

          for await (const ev of sock) {
            if (typeof ev === "string") {
              this.postMessage({
                ...JSON.parse(ev),
                source: hostname,
                destination: "Node",
              });
            }
          }

          delete this.clients[hostname];

          this.send(EMType.ClientConnectionClose, {
            clientIp: hostname,
          }, "Net");
        } else if (request.url === "/ui") {
          this.uis.push(sock);

          for await (const ev of sock) {
            if (typeof ev === "string") {
              // Use postMessage to override source
              this.postMessage({
                ...JSON.parse(ev),
                source: "Ui",
                destination: "Node",
              });
            }
          }

          this.uis = this.uis.filter((ui) => ui.conn.rid === sock.conn.rid);
        } else if (request.url === "/peer") {
          this.peers[hostname] = sock;

          this.send(EMType.PeerConnectionOpen, {
            peerIp: hostname,
          }, "Net");

          for await (const ev of sock) {
            if (typeof ev === "string") {
              // Use postMessage to override source
              this.postMessage({
                ...JSON.parse(ev),
                source: hostname,
                destination: "Node",
              });
            }
          }

          delete this.peers[hostname];

          this.send(EMType.PeerConnectionClose, {
            peerIp: hostname,
          }, "Net");
        }
      });
    }
  }

  onmessage = (ev: MessageEvent<IMessage<EMType>>) => {
    const message = ev.data;

    const destination = message.destination;

    // If it's a peer, send it to peer
    if (Object.keys(this.peers).includes(destination)) {
      this.peers[destination].send(JSON.stringify(message));

      // If it's a client, send it to client
    } else if (Object.keys(this.clients).includes(destination)) {
      this.clients[destination].send(JSON.stringify(message));

      // If it's "worker", handle message here
    } else if (destination == "NetWorker") {
      // deno-lint-ignore no-this-alias no-explicit-any
      const self: any = this;
      if (Object.keys(this).includes(message.type)) {
        self[message.type](message);
      } else {
        this.send(
          EMType.LogMessage,
          { message: "Missing handler for " + message.type },
          "Log",
        );
      }

      // If it's "ui" send it to all UIs connected
    } else if (destination == "Ui") {
      if (this.uis.length) {
        for (const ui of this.uis) {
          if (!ui.isClosed) {
            ui.send(JSON.stringify(message));
          }
        }
      }
    } else {
      this.send(EMType.InvalidMessageDestination, {
        invalidMessageDestination: destination,
        availablePeers: Object.keys(this.peers),
        availableClients: Object.keys(this.clients),
        message: message,
      }, "Logger");
    }
  };

  [EMType.NodeReady]: H<EMType.NodeReady> = (message) => {
    this._ready = message.payload.ready;
    this.send(message.type, message.payload, "Logger");
  };

  [EMType.PeerConnectionRequest]: H<EMType.PeerConnectionRequest> = (
    message,
  ) => {
    if (this.peers[message.payload.peerIp]) {
      this.send(EMType.PeerConnectionFail, {
        peerIp: message.payload.peerIp,
      }, "Logger");
    } else {
      const sock = new WebSocket(`ws://${message.payload.peerIp}:8080/peer`);
      this.peers[message.payload.peerIp] = sock;

      sock.onopen = () => {
        this.send(EMType.PeerConnectionSuccess, {
          peerIp: message.payload.peerIp,
        }, "Logger");
      };

      sock.onmessage = (ev: MessageEvent<string>) => {
        // need to use postMessage to rewrite the source and make worker transparent
        this.postMessage({
          ...JSON.parse(ev.data),
          source: message.payload.peerIp,
          destination: "Node",
        });
      };

      sock.onclose = (ev: CloseEvent) => {
        if (this.peers[message.payload.peerIp]) {
          delete this.peers[message.payload.peerIp];
          this.send(EMType.PeerConnectionClose, {
            peerIp: message.payload.peerIp,
          }, "Net");
        } else {
          this.send(EMType.PeerConnectionFail, {
            peerIp: message.payload.peerIp,
          }, "Net");
        }
      };

      this.send(EMType.PeerConnectionPending, {
        peerIp: message.payload.peerIp,
      }, "Logger");
    }
  };
}

const worker = new NetWorker();

for await (const request of worker.server) {
  worker.request(request);
}

