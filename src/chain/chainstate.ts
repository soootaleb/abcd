import { IState } from "ddapps/interface.ts";
import { of } from "ddapps/state.ts";
import { Block } from "./block.ts";
import { ICMPayload } from "./messages.ts";
import { ICRequestPayload, ICResponsePayload } from "./operation.ts";

export interface IChainState extends IState<ICRequestPayload, ICResponsePayload, ICMPayload> {
  blocks: Block[];
}

export const chainstate = {
  ...of<ICRequestPayload, ICResponsePayload, ICMPayload>(),

  blocks: [],
};
