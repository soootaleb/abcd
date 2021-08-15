import { parse } from "https://deno.land/std/flags/mod.ts";
import type {
  IKeyValue,
  IKVOp,
  IMessage,
} from "../src/interfaces/interface.ts";
import Client from "../src/client.ts";
import { EChainOpType, EKVOpType, EMonOpType, EMType } from "../src/enumeration.ts";

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
const chain: string = ARGS["chain"];
const watch: string = ARGS["watch"];

new Client(addr, port).co.then((operations) => {
  if (get) {
    operations.kvop(EKVOpType.Get, get).then((response) => {
      console.log(response.payload);
      Deno.exit();
    });
  } else if (put) {
    const [key, value] = put.split("=");
    operations.kvop(EKVOpType.Put, key, value).then((response) => {
      console.log(response.payload);
      Deno.exit();
    });
  } else if (watch) {
    const [type, value] = watch.split(":");
    if (type === "mon") {
      operations.monwatch(value, 15, (notification) => {
        const payload = notification.payload.payload as IKeyValue<
          IMessage<EMType>
        >;
        console.log(payload.value);
      });
    } else if (type === "kv") {
      operations.kvwatch(value, 1, (notification) => {
        console.clear();
        console.table(notification.payload.payload);
      });
    }
  } else if (mon) {
    operations.monop(EMonOpType.Get, mon).then((response) => {
      console.dir(response.payload, { depth: 10 });
      Deno.exit();
    });
  } else if (chain) {
    operations.chainop().then((response) => {
      console.dir(response.payload, { depth: 10 });
      Deno.exit();
    });
  } else {
    let counter = 0;
    const start: number = new Date().getTime();

    // Init monitoring
    const mon = {
      objective: n,
      requests: {
        all: {} as {
          [key: string]: {
            sent: number;
            received: number;
          };
        },
        sent: 0,
        received: 0,
        latency: {
          sum: 0,
          total: 0,
          average: 0,
        },
      },
    };

    setInterval(() => {
      const receivedCount = Object
        .entries(mon.requests.all)
        .filter((e) => e[1].received > e[1].sent)
        .length;

      const receivedLatest = Object
        .entries(mon.requests.all)
        .filter((e) => e[1].received > e[1].sent)
        .map((e) => e[0])
        .slice(receivedCount - 100);

      const latency = receivedLatest.map((key) =>
        mon.requests.all[key]
      ).reduce((acc, curr) => {
        return acc + curr.received - curr.sent;
      }, 0) / receivedLatest.length;
      console.clear();
      console.table({
        sent: mon.requests.sent,
        received: mon.requests.received,
        pending_count: mon.requests.sent - mon.requests.received,
        latency: Math.round(latency * 100) / 100,
      });

      mon.requests.all = Object
        .entries(mon.requests.all)
        .filter((e) =>
          e[1].received == e[1].sent || receivedLatest.includes(e[0])
        )
        .reduce((acc, curr) => {
          acc[curr[0]] = curr[1];
          return acc;
        }, {} as {
          [key: string]: {
            sent: number;
            received: number;
          };
        });
    }, 200);

    // Loop every interval
    setInterval(() => {
      // If duration passed or counter reached objective, stop
      if (
        (duration && new Date().getTime() < start + duration * 1000) ||
        (!duration && mon.requests.sent < mon.objective)
      ) {
        // Generate random key & request timestamp
        const key = Math.random().toString(36).substr(2);
        const sent = new Date().getTime();
        mon.requests.all[key] = {
          sent: sent,
          received: sent,
        };

        mon.requests.sent++;

        // Submit request & update monitoring
        operations.kvop(EKVOpType.Put, key, counter.toString())
          .then((message) => {
            const payload = message.payload.payload as IKVOp;
            const key = payload.kv.key;
            const sent = mon.requests.all[key].sent;
            mon.requests.all[key].received = new Date().getTime();
            mon.requests.received++;
            mon.requests.latency.sum += new Date().getTime() - sent;
            mon.requests.latency.total =
              Math.round((new Date().getTime() - start) / 10) / 100;
            mon.requests.latency.average = mon.requests.latency.sum /
              mon.requests.received;

            const report = {
              length: mon.requests.sent,
              received: mon.requests.received,
              ...mon.requests.latency,
            };

            if (
              (!duration && mon.requests.received === mon.objective) ||
              (duration &&
                report.received === report.length &&
                new Date().getTime() >= start + duration * 1000)
            ) {
              const receivedCount = Object
                .entries(mon.requests.all)
                .filter((e) => e[1].received > e[1].sent)
                .length;

              const receivedLatest = Object
                .entries(mon.requests.all)
                .filter((e) => e[1].received > e[1].sent)
                .map((e) => e[0])
                .slice(receivedCount - 100);

              const latency = receivedLatest.map((key) =>
                mon.requests.all[key]
              ).reduce((acc, curr) => {
                return acc + curr.received - curr.sent;
              }, 0) / receivedLatest.length;
              console.clear();
              console.table({
                sent: mon.requests.sent,
                received: mon.requests.received,
                pending_count: mon.requests.sent - mon.requests.received,
                latency: Math.round(latency * 100) / 100,
              });
              Deno.exit();
            }
          }).catch((error) => {
            console.log(error);
            Deno.exit();
          });
      }

      counter++;
    }, interval);
  }
}).catch(console.error);

for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
  Deno.exit();
}
