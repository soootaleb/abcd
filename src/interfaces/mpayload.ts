import { EComponent, EMType, ENodeState, EOpType } from "../enumeration.ts";
import { TWal } from "../type.ts";
import { IEntry, IKeyValue, ILog, IMessage, IMonOp, IMonWatch, IOPayload } from "./interface.ts";

export interface IMPayload {
  [EMType.LogMessage]: {
    message: string;
  };

  [EMType.InitialMessage]: null; // OK

  [EMType.DiscoveryStart]: null;

  [EMType.DiscoveryResult]: {
    success: boolean;
    result: string;
    source: string;
  };

  [EMType.DiscoveryResultIgnored]: {
    result: IMPayload[EMType.DiscoveryResult];
    state: ENodeState;
    leader: string;
  };

  [EMType.DiscoveryServerStarted]: {
    token: string;
  };

  [EMType.DiscoveryProtocolSet]: {
    protocol: string;
  };

  [EMType.DiscoveryEndpointCalled]: Deno.Addr;

  [EMType.DiscoveryBeaconSend]: null; // OK

  [EMType.DiscoveryBeaconReceived]: {
    addr: Deno.NetAddr;
    token: string;
  };

  [EMType.DiscoveryBeaconSendFail]: {
    reason: string;
    ready: boolean;
  };

  [EMType.StoreInit]: {
    [key: string]: IKeyValue;
  };

  [EMType.UILogMessage]: {
    message: IMessage<EMType>;
  };

  [EMType.UIStateUpdate]: {
    run: boolean;
    state: ENodeState;
    peers: string[];
    electionTimeout: number;
    term: number;
    heartBeatCounter: number;
    store: {
      store: Record<string, unknown>;
    };
  };

  [EMType.ClientRequest]: {
    token: string;
    type: EOpType;
    payload: IOPayload[EOpType];
    timestamp: number;
  };

  [EMType.ClientNotification]: {
    type: EOpType.KVWatch | EOpType.MonWatch;
    payload: ILog | IKeyValue | IKeyValue<IMessage<EMType>>;
  };

  [EMType.ClientResponse]: {
    token: string;
    type: EOpType;
    payload: IOPayload[EOpType];
    timestamp: number;
  };

  [EMType.ClientRequestForward]: {
    message: IMessage<EMType>;
  };

  [EMType.ClientConnectionOpen]: {
    clientIp: string;
    remoteAddr: Deno.NetAddr;
    clientId: number;
  };

  [EMType.ClientConnectionClose]: {
    clientIp: string;
  };

  [EMType.PeerConnectionRequest]: {
    peerIp: string;
  };

  [EMType.PeerConnectionOpen]: {
    peerIp: string;
  };

  [EMType.PeerConnectionPending]: {
    peerIp: string;
  };

  [EMType.PeerConnectionComplete]: {
    peerIp: string;
  };

  [EMType.PeerConnectionSuccess]: {
    peerIp: string;
  };

  [EMType.PeerConnectionFail]: {
    peerIp: string;
  };

  [EMType.PeerConnectionClose]: {
    peerIp: string;
  };

  [EMType.PeerConnectionAccepted]: {
    term: number;
    knownPeers: {
      [key: string]: {
        peerIp: string
      }
    },
    wal: TWal
  }

  [EMType.PeerServerStarted]: Deno.Addr;

  [EMType.NodeReady]: {
    ready: true;
  };

  [EMType.HeartBeat]: null;

  [EMType.AppendEntry]: IEntry;

  [EMType.NewState]: {
    from: ENodeState;
    to: ENodeState;
    reason: string
  };

  [EMType.NewTerm]: {
    term: number;
  };

  [EMType.NewTermAccepted]: {
    term: number;
    leader: {
      peerIp: string;
    };
  };

  [EMType.NewTermRejected]: {
    term: number;
  };

  [EMType.StoreVotesReset]: null,

  [EMType.StoreLogCommitFail]: IEntry;
  [EMType.StoreLogCommitRequest]: IEntry;
  [EMType.StoreLogCommitSuccess]: IEntry;

  [EMType.CallForVoteRequest]: {
    term: number;
    peerIp: string;
  };

  [EMType.CallForVoteResponse]: {
    voteGranted: boolean;
  };

  [EMType.VoteReceivedButNotCandidate]: {
    callForVoteReply: IMessage<EMType.CallForVoteResponse>;
    currentState: ENodeState;
  };

  [EMType.KVOpAccepted]: IEntry;

  [EMType.KVOpRejected]: {
    reason: string;
    request: {
      token: string;
      type: EOpType;
      payload: IOPayload[EOpType.KVOp]; // Need to fix this for new KVOp....
      timestamp: number;
    };
  };

  [EMType.StoreSyncRequest]: TWal;

  [EMType.StoreSyncComplete]: {
    report: {
      commited: IEntry[];
      appended: IEntry[];
    };
  };

  [EMType.KVOpRequest]: {
    token: string;
    type: EOpType.KVOp;
    payload: IOPayload[EOpType.KVOp];
    timestamp: number;
  };

  [EMType.KVWatchRequest]: {
    token: string;
    type: EOpType.KVWatch;
    payload: IOPayload[EOpType.KVWatch];
    timestamp: number;
  };

  [EMType.KVOpAcceptedReceivedButCommited]: IEntry;

  [EMType.KVOpRequestComplete]: IEntry;

  [EMType.KVOpRequestIncomplete]: IEntry;

  [EMType.KVOpAcceptedReceived]: {
    token: string;
    qorum: number;
    votes: number;
    message: IMessage<EMType.KVOpAccepted>;
  };

  [EMType.MonOpRequest]: {
    token: string,
    type: EOpType.MonOp,
    payload: IMonOp,
    timestamp: number
  }

  [EMType.MonWatchRequest]: {
    token: string,
    type: EOpType.MonWatch,
    payload: IMonWatch,
    timestamp: number
  };

  [EMType.InvalidDiscoveryProtocol]: {
    invalid: string;
    default: string;
    available: string[];
  };

  [EMType.InvalidMessageType]: IMessage<EMType>;

  [EMType.InvalidMessageDestination]: {
    invalidMessageDestination: EComponent | string;
    availablePeers: string[];
    availableClients: string[];
    message: IMessage<EMType>;
  };

  [EMType.InvalidTransitionToState]: {
    currentState: ENodeState;
    transitionTo: ENodeState;
  };

  [EMType.InvalidUIMessageType]: {
    message: IMessage<EMType>;
  };

  [EMType.InvalidClientRequestType]: {
    invalidType: string;
  };
}
