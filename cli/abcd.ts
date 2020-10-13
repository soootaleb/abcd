import { parse } from "https://deno.land/std/flags/mod.ts";
import { ILog, IMessage } from "../src/interface.ts";

const ARGS = parse(Deno.args);

const n: number = typeof ARGS["n"] === "number" ? ARGS["n"] : 1;
const port: string = typeof ARGS["p"] === "string" ? ARGS["p"] : "8080";
const addr: string = typeof ARGS["a"] === "string" ? ARGS["a"] : "127.0.0.1";
const cleanup: boolean = Boolean(ARGS["clean"]);
const interval: number = ARGS["i"] | 0;
const duration: number = ARGS["d"] | 0;

const start: number = new Date().getTime();

const ws: WebSocket = new WebSocket("ws://" + addr + ":" + port + "/client");

let mon = {
  objective: n,
  requests: {
    all: [] as { key: string; start: number }[],
    count: 0,
    latency: {
      sum: 0,
      total: 0,
      average: 0,
    },
  },
};

const monInteval = setInterval(() => {
  if (
    (duration && new Date().getTime() > start + duration * 1000) ||
    (!duration && mon.objective === mon.requests.count)
  ) {
    if (cleanup) {
      ws.send(JSON.stringify({
        type: "clearStore",
        source: "client",
        destination: port,
        payload: {}
      }))
    }
    console.log({
      length: mon.requests.all.length,
      count: mon.requests.count,
      ...mon.requests.latency,
    });
    clearInterval(monInteval);
  }
}, 100);

ws.onopen = (ev: Event) => {
  if (duration === 0) {
    for (let index = 0; index < n; index++) {
      setTimeout(() => {
        mon.requests.all.push(
          { key: "from_client_" + index, start: new Date().getTime() },
        );
        ws.send(JSON.stringify({
          type: "KVOpRequest",
          source: "client",
          destination: "ws://" + addr + ":" + port,
          payload: {
            action: "set",
            key: "from_client_" + index,
            value: "ping",
          },
        }));
      }, interval * index);
    }
  } else {
    const begin: number = new Date().getTime();
    let counter: number = 0;

    const proc = setInterval(() => {
      if (new Date().getTime() < begin + duration * 1000) {
        counter++;
        mon.requests.all.push(
          { key: "from_client_" + counter, start: new Date().getTime() },
        );
        ws.send(JSON.stringify({
          type: "KVOpRequest",
          source: "client",
          destination: "8080",
          payload: {
            action: "set",
            key: "from_client_" + counter,
            value: "ping",
          },
        }));
      } else {
        clearInterval(proc);
      }
    }, interval);
  }
};

ws.onmessage = (ev) => {
  const message: IMessage<ILog> = JSON.parse(ev.data);
  if (message.type === "setKVRequestComplete") {
    const request = mon.requests.all.find((o) =>
      o.key === message.payload.next.key
    );
    if (request) {
      mon.requests.count++;
      mon.requests.latency.sum += new Date().getTime() - request.start;
      mon.requests.latency.total = new Date().getTime() - start;
      mon.requests.latency.average = mon.requests.latency.sum /
        mon.requests.count;
    }
  }
};