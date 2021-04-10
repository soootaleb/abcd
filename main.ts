import Logger from "./src/logger.ts";
import Node from "./src/node.ts";
import { state } from "./src/state.ts";
import Discovery from "./src/discovery.ts";
import Net from "./src/net.ts";
import Store from "./src/store.ts";
import Api from "./src/api.ts";
import Monitor from "./src/monitor.ts";

console.table(Deno.version);

// Register Logger first so eventListener will print message before executing anything else
new Logger(state);
new Api(state);
new Monitor(state);
new Net(state);
new Store(state);
new Discovery(state);
new Node(state);

for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
  Deno.exit();
}