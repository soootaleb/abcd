import type { IKeyValue, ILog, IState } from "./interfaces/interface.ts";
import { EComponent, EKVOpType, EMType, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Store extends Messenger {
  public static readonly DEFAULT_DATA_DIR = ".";
  private static readonly WAL_WRITE_INTERVAL = 30;
  private static readonly STORE_WRITE_INTERVAL = 1000;

  constructor(protected state: IState) {
    super(state);

    // To create file if not existing
    Deno.openSync(
      this.state.store.dataDir + "/store.json",
      { append: true, create: true },
    );

    setInterval(() => {
      this.writeStore();
    }, Store.STORE_WRITE_INTERVAL);

    setInterval(() => {
      this.writeWal();
    }, Store.WAL_WRITE_INTERVAL);
  }

  private writeStore() {
    Deno.readTextFile(this.state.store.dataDir + "/store.json")
      .then((content) => {
        const store: { [key: string]: IKeyValue } = JSON.parse(content || "{}");
        for (const entry of this.state.store.bwal) {
          const log = entry.log;
          if (log.op === EKVOpType.Put) {
            store[log.next.key] = {
              key: log.next.key,
              value: log.next.value,
            };
          } else {
            this.send(EMType.LogMessage, {
              message: "Invalid EKVOPType " + log.op,
            }, EComponent.Logger);
          }
        }
        return store;
      }).then((store) => {
        const txt = this.state.store.encoder.encode(JSON.stringify(store));
        Deno.writeFile(this.state.store.dataDir + "/store.json", txt);
      });
  }

  private writeWal() {
    const entries = this.state.store.bwal.map((entry) => {
      return {
        token: entry.token,
        log: {
          ...entry.log,
          commited: true,
        },
      };
    });
    this.state.store.bwal = [];

    const str = entries.map((entry) => JSON.stringify(entry)).join("\n");
    const bytes = this.state.store.encoder.encode(str);
    this.state.store.fwal.writeSync(bytes);
    Deno.fsyncSync(this.state.store.fwal.rid);
    if(entries.length) this.send(EMType.StoreLogCommitSuccess, entries, EComponent.Store);
  }

  private get(key: string): IKeyValue {
    return this.state.store.store[key];
  }

  /**
   * Set creates the log associated with the definition of a value for a given key
   * Initializes the votes to 0 & adds it to the WAL
   * The log is created with commited = false
   * Need to call .commit() in order to persist in the store
   * @param key 
   * @param val 
   */
  private put(key: string, val: string | number): ILog {
    this.state.store.votes[key] = 0;

    const log: ILog = {
      op: EKVOpType.Put,
      commited: false,
      timestamp: new Date().getTime(),
      previous: this.get(key),
      next: {
        key: key,
        value: val,
      },
    };

    return log;
  }

  /**
   * Synchronizes the node's wal with the incoming wal from leader.
   * Only commited logs are coming so all of them are commited
   * @param wal the incoming wal from which to sync the current node's wall
   * @returns true if all logs have been commited, false otherwise
   */
  [EMType.StoreSyncRequest]: H<EMType.StoreSyncRequest> = (message) => {
    this.state.store.bwal = message.payload;

    this.send(EMType.LogMessage, {
      message: `Synchronized ${message.payload.length} logs`,
    }, EComponent.Logger);
  };

  [EMType.StoreInit]: H<EMType.StoreInit> = (message) => {
    this.state.store.store = message.payload;
  };

  [EMType.KVOpRequest]: H<EMType.KVOpRequest> = (message) => {
    const request = message.payload;
    switch (request.payload.op) {
      case EKVOpType.Put: {
        const key = request.payload.kv.key;
        const value = request.payload.kv.value;

        if (value !== undefined) {
          // Later we'll need to verify the kv is not in process
          // Otherwise, the request will have to be delayed or rejected (or use MVCC)
          const log = this.put(key, value);

          this.send(EMType.KVOpAccepted, {
            log: log,
            token: request.token,
          }, EComponent.Node);

          this.send(EMType.KVOpAccepted, {
            log: log,
            token: request.token,
          }, EComponent.Monitor); // 100%
          break;
        } else {
          this.send(EMType.KVOpRejected, {
            request: request,
            reason: "Put operation requires value !== undefined",
          }, EComponent.Node);
          break;
        }
      }

      case EKVOpType.Get: {
        if (
          Object.keys(this.state.store.store).includes(request.payload.kv.key)
        ) {
          this.send(EMType.KVOpRequestComplete, {
            log: {
              commited: true,
              op: EKVOpType.Get,
              timestamp: request.timestamp,
              next: this.get(request.payload.kv.key),
            },
            token: request.token,
          }, EComponent.Node);
        } else {
          this.send(EMType.KVOpRejected, {
            request: request,
            reason: `Key ${request.payload.kv.key} not found`,
          }, EComponent.Node);
        }
        break;
      }
      default:
        this.send(EMType.KVOpRejected, {
          request: request,
          reason: `KVOp ${request.payload.op} is not implemented`,
        }, EComponent.Logger);
    }
  };

  [EMType.KVWatchRequest]: H<EMType.KVWatchRequest> = (message) => {
    const key = message.payload.payload.key;
    const watcher = message.payload.token;
    if (Object.keys(this.state.store.watchers).includes(key)) {
      this.state.store.watchers[key].push(watcher);
    } else {
      this.state.store.watchers[key] = [watcher];
    }
  };

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (
    message,
  ) => {
    for (const entry of message.payload) {      
      const key = entry.log.next.key;
      this.state.store.wal.push(entry);
      this.state.store.store[key] = entry.log.next;
      if (Object.keys(this.state.store.watchers).includes(entry.log.next.key)) {
        for (const watcher of this.state.store.watchers[entry.log.next.key]) {
          this.send(EMType.ClientNotification, {
            token: watcher,
            type: EOpType.KVWatch,
            payload: entry.log,
          }, EComponent.Api);
        }
      }
    }
    this.send(EMType.StoreLogCommitSuccess, message.payload, EComponent.Node);
  };

  [EMType.StoreLogCommitRequest]: H<EMType.StoreLogCommitRequest> = (
    message,
  ) => {
    this.state.store.bwal.push(message.payload);
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    this.state.store.votes[message.payload.log.next.key] += 1;
  };
}
