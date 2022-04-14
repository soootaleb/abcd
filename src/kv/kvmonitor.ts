import { Monitor } from "ddapps/monitor.ts";
import { IKVState } from "./interface.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import { IKVRequestPayload, IKVResponsePayload } from "./operation.ts";
import { KVM } from "./type.ts";

export  class KVMonitor extends Monitor<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
> {

  protected [EKVMType.KVOpAccepted]() {
    this.state.mon.stats.accepted++;
  }

  protected [EKVMType.StoreLogCommitSuccess](
    message: KVM<EKVMType.StoreLogCommitSuccess>,
  ) {
    this.state.mon.stats.commited += message.payload.length;
  }

  protected [EKVMType.StoreLogCommitFail]() {
    this.state.mon.stats.rejected++;
  }
}
