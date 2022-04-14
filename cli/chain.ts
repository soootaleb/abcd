import { Command } from "cliffy";
import { CClient } from "../src/chain/client.ts";

const add = new Command()
  .description("Add a transation")
  .version("0.2.0")
  .option("-f, --from <from:string>", "Source wallet")
  .option("-t, --to <to:string>", "Destination wallet")
  .option("-q, --quantity <quantity:number>", "Amount")
  .action(async ({ address, port, from, to, quantity }: {
    address: string;
    port: number;
    from: string;
    to: string;
    quantity: number;
  }) => {
    await new CClient(address, port).co
      .then((ops) => {
        return ops.chainadd(from, to, quantity);
      }).then((response) => {
        console.dir(response);
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

const get = new Command()
  .description("Get transations")
  .version("0.2.0")
  .action(async ({ address, port }: {
    address: string;
    port: number;
  }) => {
    await new CClient(address, port).co
      .then((ops) => {
        return ops.chainget();
      }).then((response) => {
        console.dir(response, { depth: 10 });
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

const sum = new Command()
  .description("Get balances")
  .version("0.2.0")
  .action(async ({ address, port }: {
    address: string;
    port: number;
  }) => {
    await new CClient(address, port).co
      .then((ops) => {
        return ops.chainsum();
      }).then((response) => {
        console.dir(response);
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

export const chain = new Command()
  .description("Interact with blockchain")
  .version("0.2.0")
  .command("add", add)
  .command("get", get)
  .command("sum", sum);
