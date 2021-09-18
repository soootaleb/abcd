import { Command } from "https://deno.land/x/cliffy/command/mod.ts";
import Client from "../src/client.ts";

let remote: Client;

const chain = await new Command()
  .description("Interact with blockchain")
  .version("0.1.0")
  .option("-a, --address <addr>", "HTTP endpoint", { default: "localhost" })
  .option("-p, --port <port>", "HTTP port", { default: 8080 })
  .option("-f, --from <from:string>", "Source wallet")
  .option("-t, --to <to:string>", "Destination wallet")
  .option("-a, --amount <amount:number>", "Amount")
  .action(async ({ address, port, from, to, amount }: {
    address: string;
    port: number;
    from: string;
    to: string;
    amount: number;
  }) => {
    await new Client(address, port).co
      .then((ops) => {
        return ops.chainadd(from, to, amount);
      }).then((response) => {
        console.dir(response);
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

const ping = await new Command()
  .description("Ping the cluster")
  .version("0.1.0")
  .option("-a, --address <addr>", "HTTP endpoint", { default: "localhost" })
  .option("-p, --port <port>", "HTTP port", { default: 8080 })
  .action(async ({ address, port }: { address: string; port: number }) => {
    await new Client(address, port).co
      .then((ops) => {
        return ops.ping();
      }).then((response) => {
        console.dir(response);
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

await new Command()
  .name("abctl")
  .version("1.0.0")
  .description("Interact with abcd")
  .command("ping", ping)
  .command("chain", chain)
  .parse(Deno.args);
