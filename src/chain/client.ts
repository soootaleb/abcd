import { Client } from "ddapps/client.ts";
import { ECOpType, ICRequestPayload, ICResponsePayload } from "./operation.ts";
import { ICMPayload } from "./messages.ts";

export class CClient extends Client<
  ICRequestPayload,
  ICResponsePayload,
  ICMPayload
> {
  public chainadd(from: string, to: string, amount: number) {
    return this.send(ECOpType.TxAdd, {
      from: from,
      to: to,
      amount: amount,
    });
  }

  public chainget() {
    return this.send(ECOpType.TxGet, null);
  }

  public chainsum() {
    return this.send(ECOpType.TxSum, null);
  }
}
