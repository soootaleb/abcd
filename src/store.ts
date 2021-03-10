import type { IKeyValue, ILog, IMessage } from "./interfaces/interface.ts";
import { IEntry, IKVOp, IReport, IWal } from "./interfaces/interface.ts";
import { EComponent, EKVOpType, EMType, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Store extends Messenger {

  public static DEFAULT_DATA_DIR = "/home/ubuntu";
  private _data_dir = Store.DEFAULT_DATA_DIR;

  private _wal: IWal = {};

  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};

  private _fwal: Deno.File;
  private _encoder: TextEncoder;

  constructor() {
    super();

    this._data_dir = typeof this.args["data-dir"] === "string"
      ? this.args["data-dir"]
      : Store.DEFAULT_DATA_DIR;

    try {
      Deno.openSync(
        this._data_dir + "/abcd.wal",
        { create: true, write: true },
      );
    } catch (error) {
      this.send(EMType.LogMessage, {
        message: `File ${this._data_dir + "/abcd.wal"} failed to open`
      }, EComponent.Logger);
    }

    try {
      Deno.openSync(
        this._data_dir + "/store.json",
        { create: true, write: true },
      );
    } catch (error) {
      this.send(EMType.LogMessage, {
        message: `File ${this._data_dir + "/store.json"} failed to open`
      }, EComponent.Logger);
    }

    this._encoder = new TextEncoder();

    this._fwal = Deno.openSync(
      this._data_dir + "/abcd.wal",
      { append: true, create: true },
    );
  }

  [EMType.StoreInit]: H<EMType.StoreInit> = (message) => {
    this._store = message.payload;
  };

  public reset() {
    this._votes = {};
  }

  public get wal(): IWal {
    return this._wal;
  }

  public get store(): { [key: string]: IKeyValue } {
    return this._store;
  }

  public voteFor(key: string): number {
    this._votes[key] += 1;
    return this._votes[key];
  }

  private wget(key: string): { log: ILog; token: string }[] {
    if (!(key in this.wal)) {
      this.wal[key] = [];
    }
    return this.wal[key];
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  private persist(entry: {
    log: ILog;
    token: string;
  }): boolean {
    // return Promise.resolve(true);
    const bytes = this._encoder.encode(JSON.stringify(entry.log) + "\n");
    const written = this._fwal.writeSync(bytes)
    if(written === bytes.length) {
      Deno.fsyncSync(this._fwal.rid);
      this.send(EMType.StoreLogCommitRequest, entry, EComponent.StoreWorker);
      return true;
    } else {
      this.send(EMType.LogMessage, {
        message: `Log not persisted written = ${written} / ${bytes.length} total`
      }, EComponent.Logger);
      return false;
    }
  }
  public commit(entry: {
    log: ILog;
    token: string;
  }): IEntry {
    const ok = this.persist(entry);
    const key: string = entry.log.next.key;

    if (ok) {
      this.wget(key).push(entry);
      entry.log.commited = true;
      this._store[key] = entry.log.next;
      delete this._votes[key];
      this.send(EMType.StoreLogCommitSuccess, entry, EComponent.Watcher);
      this.send(EMType.StoreLogCommitSuccess, entry, EComponent.Monitor);
    } else {
      this.send(EMType.StoreLogCommitFail, entry, EComponent.Monitor);
    }

    return entry;
  }

  public empty() {
    this._store = {};
    this._wal = {};
    this._votes = {};
  }

  /**
   * Synchronizes the node's wal with the incoming wal from leader.
   * Only commited logs are coming so all of them are commited
   * @param wal the incoming wal from which to sync the current node's wall
   * @returns true if all logs have been commited, false otherwise
   */
  public sync(wal: IWal): boolean {
    let allCommited = true;

    for (const [key, logs] of Object.entries(wal)) {
      for (
        const entry of logs.sort((a, b) =>
          a.log.timestamp < b.log.timestamp ? -1 : 1
        )
      ) {
        if (!this.commit(entry)) {
          allCommited = false;
        }
      }
    }

    return allCommited;
  }

  /**
   * Set creates the log associated with the definition of a value for a given key
   * Initializes the votes to 0 & adds it to the WAL
   * The log is created with commited = false
   * Need to call .commit() in order to persist in the store
   * @param key 
   * @param val 
   */
  public put(token: string, key: string, val: string | number): ILog {
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

  public kvop(request: {
    token: string;
    type: EOpType;
    payload: IKVOp;
    timestamp: number;
  }) {
    switch (request.payload.op) {
      case EKVOpType.Put: {
        const key = request.payload.kv.key;
        const value = request.payload.kv.value;
        const token = request.token;

        if (value !== undefined) {
          // Later we'll need to verify the kv is not in process
          // Otherwise, the request will have to be delayed or rejected (or use MVCC)
          const log = this.put(token, key, value);

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
        if (Object.keys(this.store).includes(request.payload.kv.key)) {
          this.send(EMType.KVOpRequestComplete, {
            log: {
              commited: true,
              op: EKVOpType.Get,
              timestamp: new Date().getTime(),
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
  }
}
