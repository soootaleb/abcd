import { assertEquals } from "std/testing/asserts.ts";
import { CClient } from "../src/chain/client.ts";
import { parse } from "std/flags/mod.ts";
import { ECOpType, ICResponsePayload } from "../src/chain/operation.ts";
import { KVClient } from "../src/kv/client.ts";
import { EKVOpType } from "../src/kv/operation.ts";
import { IKVOp } from "../src/kv/interface.ts";

const ARGS = parse(Deno.args);

// Params parsing
const addr: string = typeof ARGS["a"] === "string" ? ARGS["a"] : "127.0.0.1";
const port: number = typeof ARGS["p"] === "number" ? ARGS["p"] : 8080;

Deno.test("E2E::Chain::Add", async () => {
  const ops = await new CClient(addr, port).co;
  const response = await ops.chainadd("from", "to", 69);
  ops.disconnect();

  const payload = response.payload.payload as ICResponsePayload[ECOpType.TxAdd];

  assertEquals(payload.from, "from");
  assertEquals(payload.to, "to");
  assertEquals(payload.amount, 69);
});

Deno.test("E2E::KV::Put", async () => {
  const ops = await new KVClient(addr, port).co;
  const response = await ops.kvput("key", "value");
  ops.disconnect();

  const co = response.payload.payload as IKVOp;

  assertEquals(co.op, EKVOpType.KVPut);
  assertEquals(co.kv.key, "key");
  assertEquals(co.kv.value, "value");
});

Deno.test("E2E::KV::Get", async () => {
  const ops = await new KVClient(addr, port).co;
  await ops.kvput("my-key", "my-value");
  const response = await ops.kvget("my-key");
  ops.disconnect();

  const co: IKVOp = response.payload.payload as IKVOp;

  assertEquals(co.op, EKVOpType.KVGet);
  assertEquals(co.kv.key, "my-key");
  assertEquals(co.kv.value, "my-value");
});
