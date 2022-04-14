import { Api } from "ddapps/api.ts";
import { ChainPeer } from "./chainpeer.ts";
import { M } from "ddapps/type.ts";
import { ECMType, ICMPayload } from "./messages.ts";
import { IChainState } from "./chainstate.ts";
import { EMType } from "ddapps/messages.ts";
import { CM } from "./type.ts";
import { ECOpType, ICRequestPayload, ICResponsePayload } from "./operation.ts";

export  class ChainApi extends Api<
  ICRequestPayload,
  ICResponsePayload,
  ICMPayload,
  IChainState
> {
  constructor(protected state: IChainState) {
    super(state);
  }

  protected [EMType.ClientRequest](
    message: M<EMType.ClientRequest> | CM<EMType.ClientRequest>,
  ) {
    super.ClientRequest(message as M<EMType.ClientRequest>);
    const msg = message as CM<EMType.ClientRequest>;
    switch (msg.payload.type) {
      case ECOpType.TxAdd: {
        this.send(
          ECMType.ChainAddRequest,
          {
            token: message.payload.token,
            type: ECOpType.TxAdd,
            payload: msg.payload.payload as ICRequestPayload[ECOpType.TxAdd],
            timestamp: message.payload.timestamp,
          },
          ChainPeer,
        );
        break;
      }
      case ECOpType.TxGet: {
        this.send(
          ECMType.ChainGetRequest,
          {
            token: message.payload.token,
            type: ECOpType.TxGet,
            payload: msg.payload.payload as ICRequestPayload[ECOpType.TxGet],
            timestamp: message.payload.timestamp,
          },
          ChainPeer,
        );
        break;
      }
      case ECOpType.TxSum: {
        this.send(
          ECMType.ChainSumRequest,
          {
            token: message.payload.token,
            type: ECOpType.TxSum,
            payload: msg.payload.payload as ICRequestPayload[ECOpType.TxSum],
            timestamp: message.payload.timestamp,
          },
          ChainPeer,
        );
        break;
      }
    }
  }
}
