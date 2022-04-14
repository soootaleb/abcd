import { Api } from "ddapps/api.ts";
import { EMType } from "ddapps/messages.ts";
import { M } from "ddapps/type.ts";
import { ENodeState } from "./enumeration.ts";
import { IKVState, IKVWatch } from "./interface.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";
import { Store } from "./store.ts";
import { KVM } from "./type.ts";

export  class KVApi extends Api<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
> {
  protected [EMType.ClientRequest](
    message: M<EMType.ClientRequest> | KVM<EMType.ClientRequest>,
  ) {
    super.ClientRequest(message as M<EMType.ClientRequest>);
    switch (message.payload.type) {
      case EKVOpType.KVPut:
      case EKVOpType.KVGet: {
        const state: IKVState = this.state as IKVState;
        if (state.role === ENodeState.Leader) {
          this.send(
            EKVMType.KVOpRequest,
            {
              type: message.payload.type,
              token: message.payload.token,
              trace: message.payload.trace,
              timestamp: message.payload.timestamp,
              payload: message.payload
                .payload as IKVRequestPayload[EKVOpType.KVPut],
            },
            Store,
          );
        } else {
          this.send(
            EMType.ClientRequest,
            message.payload,
            state.leader,
          );
        }
        break;
      }
      case EKVOpType.KVWatch: {
        this.send(
          EKVMType.KVWatchRequest,
          {
            token: message.payload.token,
            trace: message.payload.trace,
            timestamp: message.payload.timestamp,
            type: EKVOpType.KVWatch,
            payload: message.payload.payload as IKVWatch,
          },
          Store,
        );
        break;
      }
    }
  }
}
