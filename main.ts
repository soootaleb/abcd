import Logger from "./src/logger.ts";
import Peer from "./src/node.ts";
import { state } from "./src/state.ts";
import Net from "./src/net.ts";
import Store from "./src/store.ts";
import Api from "./src/api.ts";
import Monitor from "./src/monitor.ts";
import { serve } from "https://deno.land/std/http/server.ts";

console.table({
  ...Deno.version,
  abcd: 'v11.2'
});

const server = serve({ hostname: "0.0.0.0", port: 8080 });

// Register Logger first so eventListener will print message before executing anything else
new Logger(state);
new Api(state);
new Monitor(state);
new Store(state);
new Peer(state);

const net = new Net(state);

Deno.signal(Deno.Signal.SIGINT).then(() => Deno.exit())

for await (const request of server) {
  net.request(request);
}