import { H, M } from "ddapps/type.ts";
import { IKVRequestPayload, IKVResponsePayload } from "./operation.ts";
import { IKVMPayload } from "./messages.ts";
import { ILog } from "./interface.ts";
/**
 * EMType Handler (H) is a function accepting an IMessage<EMType>
 */
export type KVH<T extends keyof IKVMPayload> = H<T, IKVRequestPayload, IKVResponsePayload, IKVMPayload>; 

// [OK] User needs to declare the payload typing function
export type KVM<T extends keyof IKVMPayload> = M<
  T,
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload
>;

export type TWal = { log: ILog; token: string }[];
