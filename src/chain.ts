import type { ILog } from "./interfaces/interface.ts";
import { EComponent, EMType, ENodeState, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Chain extends Messenger {

  public shutdown() {
    super.shutdown();
    clearTimeout(this.state.electionTimeoutId);
    clearInterval(this.state.heartBeatIntervalId);
  }

  [EMType.ChainOpRequest]: H<EMType.ChainOpRequest> = (message) => {
      this.send(message.type, message.payload, message.source);
  }

}
