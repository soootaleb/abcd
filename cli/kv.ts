import { Command } from "cliffy";
import { KVClient } from "../src/kv/client.ts";
import { IKVOp } from "../src/kv/interface.ts";
import { EKVOpType } from "../src/kv/operation.ts";

const put = new Command()
  .description("Add a key-value pair")
  .version("0.2.0")
  .option("-k, --key <key:string>", "Key part")
  .option("-v, --value <value:string>", "Value part")
  .action(async ({ address, port, key, value }: {
    address: string;
    port: number;
    key: string;
    value: string;
  }) => {
    await new KVClient(address, port).co
      .then((ops) => {
        return ops.kvput(key, value);
      }).then(response => {
        console.dir(response);
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

const get = new Command()
  .description("Get a key's value")
  .version("0.2.0")
  .option("-k, --key <key:string>", "The key to retrieve")
  .action(async ({ address, port, key }: {
    address: string;
    port: number;
    key: string;
  }) => {
    await new KVClient(address, port).co
      .then((ops) => {
        return ops.kvget(key);
      }).then((response) => {
        console.dir(response, { depth: 10 });
        Deno.exit(0);
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

const watch = new Command()
  .description("Watch a key's changes")
  .version("0.2.0")
  .option("-k, --key <key:string>", "The key to watch")
  .option("-e, --expire <expire:number>", "Number of notifications", { default: -1 })
  .action(async ({ address, port, key, expire }: {
    address: string;
    port: number;
    key: string;
    expire: number
  }) => {
    await new KVClient(address, port).co
      .then((ops) => {

        ops.listen(EKVOpType.KVWatch, (notification) => {
          console.clear();
          console.table(notification.payload.payload)
        })

        return ops.kvwatch(key, expire);
      }).then((response) => {
        const payload = response.payload.payload as {
          key: string,
          value: string | number
        }
        console.log(payload.value);
        Deno.exit(0);
      }).catch((message) => {
        console.error(message);
        Deno.exit(1);
      });
  });

const load = new Command()
  .description("KVOps Load test")
  .version("0.2.0")
  .option("-i, --interval <interval:number>", "Ops interval in ms", {
    default: 0,
  })
  .option("-n, --number <number:number>", "Ops count", { default: 1 })
  .option("-d, --duration <duration:number>", "Load test duration", {
    default: 0,
  })
  .action(async ({ address, port, interval, number, duration }: {
    address: string;
    port: number;
    interval: number;
    number: number;
    duration: number;
  }) => {
    await new KVClient(address, port).co
      .then((ops) => {
        let counter = 0;
        const start: number = new Date().getTime();

        // Init monitoring
        const mon = {
          objective: number,
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
            const key = Math.random().toString(36).substring(2);
            const sent = new Date().getTime();
            mon.requests.all[key] = {
              sent: sent,
              received: sent,
            };

            mon.requests.sent++;

            // Submit request & update monitoring
            ops.kvput(key, counter.toString())
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
      }).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
  });

export const kv = new Command()
  .description("Interact with key-value store")
  .version("0.2.0")
  .command("put", put)
  .command("get", get)
  .command("watch", watch)
  .command("load", load);
