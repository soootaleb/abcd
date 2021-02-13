import { parse } from "https://deno.land/std/flags/mod.ts";
import type { IKVOp, ILog, IMessage } from "../src/interfaces/interface.ts";
import Client from "../src/client.ts";
import { EKVOpType, EMonOpType } from "../src/enumeration.ts";

const ARGS = parse(Deno.args);

// Params parsing
const n: number = typeof ARGS["n"] === "number" ? ARGS["n"] : 1;
const port: number = typeof ARGS["p"] === "number" ? ARGS["p"] : 8080;
const addr: string = typeof ARGS["a"] === "string" ? ARGS["a"] : "127.0.0.1";
const interval: number = ARGS["i"] | 0;
const duration: number = ARGS["d"] | 0;

const get: string = ARGS["get"];
const put: string = ARGS["put"] || ARGS["set"];
const mon: string = ARGS["mon"];
const watch: string = ARGS["watch"];

new Client(addr, port).co.then((operations) => {

  if (get) {
    operations.kvop(EKVOpType.Get, get).then(console.log)
  } else if (put) {
    const [key, value] = put.split("=")
    operations.kvop(EKVOpType.Put, key, value).then(console.log)
  } else if (watch) {
    const [type, value] = watch.split(":")
    if (type === "mon") {
      operations.monwatch(value, 1, (notification) => {
        console.clear()
        console.table(notification.payload.payload)
      })
    } else if (type === "kv") {
      operations.kvwatch(value, 1, (notification) => {
        console.clear()
        console.table(notification.payload.payload)
      })
    }
  } else if (mon) {
    operations.monop(EMonOpType.Get, mon).then(console.log)
  } else {
      
      let counter = 0;
      const start: number = new Date().getTime();

      // Init monitoring
      const mon = {
        objective: n,
        requests: {
          all: {} as { [key: string]: {
            sent: number,
            received: number
          } },
          count: 0,
          latency: {
            sum: 0,
            total: 0,
            average: 0,
          },
        },
      };

      setInterval(() => {
        const total = Object.keys(mon.requests.all).length;
        const latest = Object.keys(mon.requests.all).slice(total - 100)
        const latency = latest.map((key) => mon.requests.all[key]).reduce((acc, curr) => {
          return acc + curr.received - curr.sent
        }, 0) / latest.length
        console.clear();
        console.table({
          sent: Object.keys(mon.requests.all).length,
          received: mon.requests.count,
          pending_count: Object.keys(mon.requests.all).length - mon.requests.count,
          pending_prop: (Object.keys(mon.requests.all).length - mon.requests.count) / Object.keys(mon.requests.all).length,
          latency: Math.round(latency * 100) / 100
        })
      }, 1000)

      // Loop every interval
      const proc = setInterval(() => {
        
        // If duration passed or counter reached objective, stop
        if ((duration && new Date().getTime() < start + duration * 1000)
          || (!duration && Object.keys(mon.requests.all).length < mon.objective)) {


          // Generate random key & request timestamp
          const key = Math.random().toString(36).substr(2);
          const sent = new Date().getTime();
          mon.requests.all[key] = {
            sent: sent,
            received: sent
          };

          // Submit request & update monitoring
          operations.kvop(EKVOpType.Put, key, counter.toString())
            .then((message) => {
              const payload = message.payload.payload as IKVOp
              const key = payload.kv.key
              const sent = mon.requests.all[key].sent;
              mon.requests.all[key].received = new Date().getTime()
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

              if ((!duration && mon.requests.count === mon.objective)
                  || (duration
                      && report.count === report.length
                      && new Date().getTime() >= start + duration * 1000)
              ) {
                Deno.exit();
              }
            }).catch((error) => {
              console.log(error)
              Deno.exit();
            });
        }

        counter++;
      }, interval);
    
  }
})