import type { IKeyValue, ILog } from "./interfaces/interface.ts";
import { IEntry, IKVOp } from "./interfaces/interface.ts";
import { EComponent, EKVOpType, EMType, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H, TWal } from "./type.ts";

export default class Store extends Messenger {
  public static readonly DEFAULT_DATA_DIR = "/home/ubuntu";
  private static readonly WAL_WRITE_INTERVAL = 30;
  private static readonly STORE_WRITE_INTERVAL = 1000;

  private _data_dir = Store.DEFAULT_DATA_DIR;

  private _wal: TWal = [];

  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};

  private _fwal: Deno.File;
  private encoder: TextEncoder = new TextEncoder();

  private watchers: {
    [key: string]: string[];
  } = {};

  private _bwal: IEntry[] = [];

  constructor() {
    super();

    this._data_dir = typeof this.args["data-dir"] === "string"
      ? this.args["data-dir"]
      : Store.DEFAULT_DATA_DIR;

    this._fwal = Deno.openSync(
      this._data_dir + "/abcd.wal",
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
    Deno.readTextFile(this._data_dir + "/store.json")
      .then((content) => {
        const store: { [key: string]: IKeyValue } = JSON.parse(
          content || "{}",
        );
        for (const entry of this._bwal) {
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
        const txt = this.encoder.encode(JSON.stringify(store));
        Deno.writeFile(this._data_dir + "/store.json", txt);
      });
  }

  private writeWal() {
    const entries = this._bwal.map((entry) => {
      return {
        ...entry,
        commited: true,
      };
    });

    const str = entries.map((entry) => JSON.stringify(entry)).join("\n");
    const bytes = this.encoder.encode(str);
    this._fwal.writeSync(bytes);
    Deno.fsyncSync(this._fwal.rid);
    for (const entry of entries) {
      this.send(EMType.StoreLogCommitSuccess, entry, EComponent.Store);
    }
    this._bwal = [];
  }

  public get wal(): TWal {
    return this._wal;
  }

  public get votes() {
    return this._votes;
  }

  private get(key: string): IKeyValue {
    return this._store[key];
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
    this._votes[key] = 0;

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
    this._bwal = message.payload;

    this.send(EMType.LogMessage, {
      message: `Synchronized ${message.payload.length} logs`,
    }, EComponent.Logger);
  };

  [EMType.StoreInit]: H<EMType.StoreInit> = (message) => {
    this._store = message.payload;
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
        if (Object.keys(this._store).includes(request.payload.kv.key)) {
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
    const watcher = message.source;
    if (Object.keys(this.watchers).includes(key)) {
      this.watchers[key].push(watcher);
    } else {
      this.watchers[key] = [watcher];
    }
  };

  [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (
    message,
  ) => {
    const key = message.payload.log.next.key;
    const entry = message.payload;
    this._wal.push(entry);
    this._store[key] = entry.log.next;
    delete this._votes[key];
    if (Object.keys(this.watchers).includes(entry.log.next.key)) {
      for (const watcher of this.watchers[entry.log.next.key]) {
        this.send(EMType.ClientNotification, {
          type: EOpType.KVWatch,
          payload: entry.log,
        }, watcher);
      }
    }
    this.send(message.type, message.payload, EComponent.Node);
  };

  [EMType.StoreLogCommitRequest]: H<EMType.StoreLogCommitRequest> = (
    message,
  ) => {
    this._bwal.push(message.payload);
  };

  [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
    this._votes[message.payload.log.next.key] += 1;
  };

  [EMType.StoreVotesReset]: H<EMType.StoreVotesReset> = (message) => {
    this._votes = {};
  };
}
