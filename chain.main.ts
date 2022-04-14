import { chainstate, IChainState } from "./src/chain/chainstate.ts";
import { ChainApi } from "./src/chain/chainapi.ts";
import { DDAPPS } from "ddapps/ddapps.ts";
import { ChainPeer } from "./src/chain/chainpeer.ts";
import { ICMPayload } from "./src/chain/messages.ts";
import { ICRequestPayload, ICResponsePayload } from "./src/chain/operation.ts";

new DDAPPS<
  ICRequestPayload,
  ICResponsePayload,
  ICMPayload,
  IChainState
>().use(ChainApi)
  .use(ChainPeer)
  .run(chainstate);
