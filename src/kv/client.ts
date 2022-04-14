import { Client } from "ddapps/client.ts";
import { IKVMPayload } from "./messages.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";

export class KVClient extends Client<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload
> {

  public kvget(key: string) {
    return this.send(EKVOpType.KVGet, key);
  }

  public kvput(key: string, value: string | number) {
    return this.send(EKVOpType.KVPut, {
      key: key,
      value: value,
    });
  }

  public kvwatch(key: string, expire = -1) {
    return this.send(EKVOpType.KVWatch, {
      key: key,
      expire: expire,
    });
  }
}
