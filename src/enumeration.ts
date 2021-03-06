export enum ENodeState {
  Leader = "Leader",
  Follower = "Follower",
  Starting = "Starting",
  Candidate = "Candidate",
}

export enum EComponent {
  Node = "Peer",
  Store = "Store",
  Discovery = "Discovery",
  Net = "Net",
  Monitor = "Monitor",
  Logger = "Logger",
  Api = "Api"
}

export enum EKVOpType {
  Put = "Put",
  Get = "Get",
}

export enum EMonOpType {
  Set = "Set",
  Get = "Get"
}

export enum EOpType {
  KVOp = "KVOp",
  KVWatch = "KVWatch",
  MonOp = "MonOp",
  MonWatch = "MonWatch"
}

export enum EMType {
  LogMessage = "LogMessage",
  InitialMessage = "InitialMessage",

  // DISCOVERY
  DiscoveryResult = "DiscoveryResult",
  DiscoveryEndpointCalled = "DiscoveryEndpointCalled",

  // Store

  StoreInit = "StoreInit",
  StoreSyncRequest = "StoreSyncRequest",
  StoreSyncComplete = "StoreSyncComplete",
  StoreLogCommitFail = "StoreLogCommitFail",
  StoreLogCommitRequest = "StoreLogCommitRequest",
  StoreLogCommitSuccess = "StoreLogCommitSuccess",

  // CLIENT

  ClientRequest = "ClientRequest",
  ClientResponse = "ClientResponse",
  ClientNotification = "ClientNotification",
  ClientRequestForward = "ClientRequestForward",
  ClientConnectionOpen = "ClientConnectionOpen",
  ClientConnectionClose = "ClientConnectionClose",

  // PEER CONNECTION

  PeerConnectionRequest = "PeerConnectionRequest",
  PeerConnectionAccepted = "PeerConnectionAccepted",
  PeerConnectionOpen = "PeerConnectionOpen",
  PeerConnectionPending = "PeerConnectionPending",
  PeerConnectionComplete = "PeerConnectionComplete",
  PeerConnectionSuccess = "PeerConnectionSuccess",
  PeerConnectionClose = "PeerConnectionClose",

  // NODE RAFT

  HeartBeat = "HeartBeat",
  AppendEntry = "AppendEntry",

  NewState = "NewState",
  NewTerm = "NewTerm",

  CallForVoteRequest = "CallForVoteRequest",
  CallForVoteResponse = "CallForVoteResponse",
  NewTermAccepted = "NewTermAccepted",
  NewTermRejected = "NewTermRejected",
  VoteReceivedButNotCandidate = "VoteReceivedButNotCandidate",

  // MONOPERATIONS
  MonOpRequest = "MonOpRequest",
  MonWatchRequest = "MonWatchRequest",

  // KVOPERATIONS
  KVOpRequest = "KVOpRequest",
  KVOpAccepted = "KVOpAccepted",
  KVOpRejected = "KVOpRejected",
  KVWatchRequest = "KVWatchRequest",
  KVOpAcceptedReceivedButCommited = "KVOpAcceptedReceivedButCommited",
  KVOpRequestComplete = "KVOpRequestComplete",
  KVOpRequestIncomplete = "KVOpRequestIncomplete",
  KVOpAcceptedReceived = "KVOpAcceptedReceived",

  // ERROR MESSAGES

  InvalidMessageType = "InvalidMessageType",
  InvalidMessageDestination = "InvalidMessageDestination",
  InvalidTransitionToState = "InvalidTransitionToState",
  InvalidUIMessageType = "InvalidUIMessageType",
  InvalidClientRequestType = "InvalidClientRequestType",
}