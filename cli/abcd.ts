import { parse } from "https://deno.land/std/flags/mod.ts";
import type { ILog, IMessage } from "../src/interface.ts";
import Client from "../src/client.ts";

const ARGS = parse(Deno.args);

// Params parsing
const n: number = typeof ARGS["n"] === "number" ? ARGS["n"] : 1;
const port: number = typeof ARGS["p"] === "number" ? ARGS["p"] : 8080;
const addr: string = typeof ARGS["a"] === "string" ? ARGS["a"] : "127.0.0.1";
const interval: number = ARGS["i"] | 0;
const duration: number = ARGS["d"] | 0;

// Connect client
new Client(addr, port).co.then((operations) => {
  
  let counter = 0;
  const start: number = new Date().getTime();

  // Init monitoring
  const mon = {
    objective: n,
    requests: {
      all: {} as { [key: string]: number },
      count: 0,
      latency: {
        sum: 0,
        total: 0,
        average: 0,
      },
    },
  };

  // Loop every interval
  const proc = setInterval(() => {
    
    // If duration passed or counter reached objective, stop
    if ((duration && new Date().getTime() < start + duration * 1000)
      || (!duration && Object.keys(mon.requests.all).length < mon.objective)) {


      // Generate random key & request timestamp
      const key = Math.random().toString(36).substr(2);
      const sent = new Date().getTime();
      mon.requests.all[key] = sent;

      // Submit request & update monitoring
      operations.kvop("put", key, counter.toString())
        .then((message) => {
          const key = message.payload.response.payload.next.key
          const sent = mon.requests.all[key];
          mon.requests.count++;
          mon.requests.latency.sum += new Date().getTime() - sent;
          mon.requests.latency.total = Math.round((new Date().getTime() - start) / 10) / 100;
          mon.requests.latency.average = mon.requests.latency.sum /
            mon.requests.count;

          const report = {
            length: Object.keys(mon.requests.all).length,
            count: mon.requests.count,
            ...mon.requests.latency,
          };

          console.log("[MON]", report);

          if ((!duration && mon.requests.count === mon.objective)
              || (duration
                  && report.count === report.length
                  && new Date().getTime() >= start + duration * 1000)
          ) {
            Deno.exit();
          }
        });
    }

    counter++;
  }, interval);
});
