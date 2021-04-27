import Logger from "./src/logger.ts";
import Peer from "./src/node.ts";
import { state } from "./src/state.ts";
import Net from "./src/net.ts";
import Store from "./src/store.ts";
import Api from "./src/api.ts";
import Monitor from "./src/monitor.ts";

console.table(Deno.version);

// Register Logger first so eventListener will print message before executing anything else
new Logger(state);
new Api(state);
new Monitor(state);
new Store(state);
new Peer(state);

const net = new Net(state);

Deno.signal(Deno.Signal.SIGINT).then(() => Deno.exit())

for await (const request of net.server) {
  net.request(request);
}