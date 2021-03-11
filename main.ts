import Logger from "./src/logger.ts";
import Node from "./src/node.ts";

console.table(Deno.version);

// Register Logger first so eventListener will print message first
new Logger();
new Node();

for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
  Deno.exit();
}