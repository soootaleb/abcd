export enum ENodeState {
  Leader = "Leader",
  Follower = "Follower",
  Starting = "Starting",
  Candidate = "Candidate",
}

export enum EKVComponent {
  Store = "Store",
  KVApi = "KVApi",
  KVPeer = "KVPeer"
}