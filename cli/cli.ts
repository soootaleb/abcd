import { chain } from "./chain.ts";
import { kv } from "./kv.ts";

import { ddappsctl } from "ddapps/cli/cli.ts";

await ddappsctl
  .command("chain", chain)
  .command("kv", kv)
  .parse(Deno.args);
