import { Command } from "https://deno.land/x/cliffy/command/mod.ts";
import Client from "../src/client.ts";

let remote: Client;

await new Command()
  .name("abctl")
  .version("1.0.0")
  .description("Interact with abcd")
  .option("-a, --address <addr>", "HTTP endpoint", { default: "localhost" })
  .option("-p, --port <port>", "HTTP port", { default: 8080 })
  .action(async ({ address, port }: { address: string; port: number }) => {
    remote = await new Client(address, port).co.catch(_ => Deno.exit(1));
    await remote?.ping().then(console.dir);
  })
  .command("chain", new Command()
    .description("Interact with blockchain")
    .version("0.1.0")
    .option("-f, --from <from:string>", "Source wallet")
    .option("-t, --to <to:string>", "Destination wallet")
    .option("-a, --amount <amount:number>", "Amount")
    .action(async ({ from, to, amount } : {
      from: string,
      to: string,
      amount: number
    }) => {
      const response = await remote.chainadd(from, to, amount);
      console.dir(response);
      Deno.exit(0)
    })
  )
  .parse(Deno.args);
