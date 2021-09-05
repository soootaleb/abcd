import { Command } from "https://deno.land/x/cliffy/command/mod.ts";
import Client from "../src/client.ts";

let remote: Client;

await new Command()
  .name("abctl")
  .version("1.0.0")
  .description("Interact with abcd")
  .option("-a, --address <addr>", "HTTP endpoint", { default: "localhost" })
  .option("-p, --port <port>", "HTTP port", { default: 8080 })
  .action(async ({ address, port }) => {
    remote = await new Client(address, port).co;
    await remote.ping().then(console.dir);
    Deno.exit(0);
  })
  .parse(Deno.args);
