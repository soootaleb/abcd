import { KVLogger } from "./src/kv/kvlogger.ts";
import { kvstate } from "./src/kv/kvstate.ts";
import { KVApi } from "./src/kv/kvapi.ts";
import { Store } from "./src/kv/store.ts";
import { KVMonitor } from "./src/kv/kvmonitor.ts";
import { KVPeer } from "./src/kv/kvpeer.ts";
import { IKVState } from "./src/kv/interface.ts";
import { IKVMPayload } from "./src/kv/messages.ts";
import { IKVRequestPayload,IKVResponsePayload } from "./src/kv/operation.ts";

import { DDAPPS } from "ddapps/ddapps.ts";

new DDAPPS<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
>().use(KVLogger)
  .use(KVApi)
  .use(KVMonitor)
  .use(Store)
  .use(KVPeer)
  .run(kvstate);
