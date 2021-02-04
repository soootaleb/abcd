export enum ENodeState {
  Leader = "Leader",
  Follower = "Follower",
  Starting = "Starting",
  Candidate = "Candidate",
}

export enum EKVOpType {
  Put = "put",
  Get = "get",
}

export enum EOpType {
  KVOp = "KVOp",
  KVWatch = "KVWatch",
}

export enum EMType {
  LogMessage = "LogMessage",
  InitialMessage = "InitialMessage",

  // DISCOVERY

  DiscoveryResult = "DiscoveryResult",
  DiscoveredResultIgnored = "DiscoveredResultIgnored",
  DiscoveryServerStarted = "DiscoveryServerStarted",
  DiscoveryProtocolSet = "DiscoveryProtocolSet",
  DiscoveryEndpointCalled = "DiscoveryEndpointCalled",
  DiscoveryBeaconSend = "DiscoveryBeaconSend",
  DiscoveryBeaconReceived = "DiscoveryBeaconReceived",
  DiscoveryBeaconSendFail = "DiscoveryBeaconSendFail",

  // UI

  UILogMessage = "UILogMessage",
  UIStateUpdate = "UIStateUpdate",

  // CLIENT

  ClientRequest = "ClientRequest",
  ClientResponse = "ClientResponse",
  ClientRequestForward = "ClientRequestForward",
  ClientConnectionOpen = "ClientConnectionOpen",
  ClientConnectionClose = "ClientConnectionClose",

  // PEER CONNECTION

  PeerAdded = "PeerAdded",
  PeerConnected = "PeerConnected",
  PeerConnectionRequest = "PeerConnectionRequest",
  PeerConnectionAccepted = "PeerConnectionAccepted",
  PeerConnectionOpen = "PeerConnectionOpen",
  PeerConnectionPending = "PeerConnectionPending",
  PeerConnectionComplete = "PeerConnectionComplete",
  PeerConnectionSuccess = "PeerConnectionSuccess",
  PeerConnectionFail = "PeerConnectionFail",
  PeerConnectionClose = "PeerConnectionClose",
  PeerServerStarted = "PeerServerStarted",

  // NODE RAFT

  NodeReady = "NodeReady",
  HeartBeat = "HeartBeat",

  NewState = "NewState",
  NewTerm = "NewTerm",

  CommitedLog = "CommitedLog",
  CallForVoteRequest = "CallForVoteRequest",
  CallForVoteResponse = "CallForVoteResponse",
  NewTermAccepted = "NewTermAccepted",
  NewTermRejected = "NewTermRejected",
  VoteReceivedButNotCandidate = "VoteReceivedButNotCandidate",

  // KVOPERATIONS
  
  KVOpAccepted = "KVOpAccepted",
  KVOpStoreSyncComplete = "KVOpStoreSyncComplete",
  KVOpAcceptedReceivedButCommited = "KVOpAcceptedReceivedButCommited",
  KVOpRequestComplete = "KVOpRequestComplete",
  KVOpRequestIncomplete = "KVOpRequestIncomplete",
  KVOpAcceptedReceived = "KVOpAcceptedReceived",

  // ERROR MESSAGES

  InvalidDiscoveryProtocol = "InvalidDiscoveryProtocol",
  InvalidMessageType = "InvalidMessageType",
  InvalidMessageDestination = "InvalidMessageDestination",
  InvalidTransitionToState = "InvalidTransitionToState",
  InvalidUIMessageType = "InvalidUIMessageType",
  InvalidClientRequestType = "InvalidClientRequestType",
}