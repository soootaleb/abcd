import type { IKeyValue, ILog, IMessage } from "./interfaces/interface.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import { IEntry, IKVOp, IReport, IWal } from "./interfaces/interface.ts";
import { EKVOpType, EMType, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

export default class Store extends Messenger {
  private worker: Worker;

  public static readonly STORE_DATA_DIR =
    new URL("..", import.meta.url).pathname + "data/";

  private _wal: IWal = {};

  /**
   * In order to prevent master node to send a log mutliple times (until it's commited)
   * the node will read the latest logs using Store.buffer get method;
   * The getter erases the buffer each time, so logs in buffer are read only once
   */
  private _buffer: IWal = {};

  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};

  private _fwal: Deno.File;
  private _encoder: TextEncoder;

  /**
   * WARNING: The getter exists ONLY for the master node to send logs only one time
   * Reading the buffer will erase it, preventing the master from sending the latest logs
   * If you need to read the WAL, use Store.wget(key)
   */
  public get buffer(): IWal {
    const outcome = { ...this._buffer };
    this._buffer = {};
    return outcome;
  }

  constructor(messages: Observe<IMessage<EMType>>) {
    super(messages);

    // START THE WORKER
    this.worker = new Worker(
      new URL(".", import.meta.url).href + "workers/store.worker.ts",
      {
        type: "module",
        deno: true,
      },
    );

    // Push worker messages to queue
    // If destination is Net, message will be handled by messages.bind()
    this.worker.onmessage = (ev: MessageEvent) => {
      const message: IMessage<EMType> = ev.data;
      this.send(
        message.type,
        message.payload,
        message.destination,
        message.source,
      );
    };

    this.messages.bind((message) => {
      if (message.destination == "StoreWorker") {
        this.worker.postMessage(message);
      }
    });

    this._encoder = new TextEncoder();

    this._fwal = Deno.openSync(
      Store.STORE_DATA_DIR + "abcd.wal",
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

  private bget(key: string): { log: ILog; token: string }[] {
    if (!(key in this._buffer)) {
      this._buffer[key] = [];
    }
    return this._buffer[key];
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  private async persist(entry: {
    log: ILog;
    token: string;
  }): Promise<boolean> {
    // return Promise.resolve(true);
    const bytes = this._encoder.encode(JSON.stringify(entry.log) + "\n");
    return this._fwal.write(bytes)
      .then((written: number) => {
        return Deno.fsync(this._fwal.rid)
          .then(() =>
            this.send(EMType.StoreLogCommitRequest, entry, "StoreWorker")
          )
          .then(() => written === bytes.length);
      }).catch(() => false);
  }
  public async commit(entry: {
    log: ILog;
    token: string;
  }): Promise<IEntry> {
    return this.persist(entry)
      .then((ok: boolean) => {
        const key: string = entry.log.next.key;

        if (ok) {
          this.wget(key).push(entry);
          entry.log.commited = true;
          this.bget(key).push(entry);
          this._store[key] = entry.log.next;
          delete this._votes[key];
        }

        return entry;
      });
  }

  public empty() {
    this._store = {};
    this._wal = {};
    this._votes = {};
  }

  /**
   * Synchronizes the node's wall with the incoming wal from leader. On the node's wal (leader has the truth)
   * - Removes uncommited logs
   * - Commits incoming logs with a higher timestamp that the latest commited log
   * - Appends uncommited logs
   * @param wal the incoming wal from which to sync the current node's wall
   * @returns a report listing the logs that have been commited & the ones appended only (for the node to notify the leader)
   */
  public async sync(wal: IWal): Promise<IReport> {
    const report: IReport = {
      commited: [],
      appended: [],
    };

    // For each key of the store
    for (const key in wal) {
      // [DEPRECATED] Remove uncommited logs => no uncommited logs in WAL (.set() will only fill buffer for master to send)

      // [DEPRECATED] Get latest log (if any, otherwise undefined)

      // [DEPRECATED] Keep only incoming logs with higher timestamp => useless since logs are sent once
      // /!\ This may be necessary in case of SPLIT BRAIN (old master / logs received)

      // [TODO] Filter logs from current term (c.f README) => SPLIT BRAIN problem should be solved

      // [DEPRECATED] We need to sort() in order to commit in the right order later

      // For all incoming logs, in the correct order (sort)
      for (
        const entry of wal[key].sort((a, b) =>
          a.log.timestamp < b.log.timestamp ? -1 : 1
        )
      ) {
        // We commit if the log is commited
        if (entry.log.commited) {
          // It's important to call .commit() instead of just .append() with log.commited = true
          // That's because later, .commit() will actually perform I/O operations that .append() won't
          await this.commit(entry)
            .then((entry) => {
              if (entry.log.commited) {
                report.commited.push(entry);
                this.send(EMType.StoreLogCommitSuccess, entry, "Logger");
              } else {
                this.send(EMType.StoreLogCommitFail, entry, "Logger");
              }
            });
        } else {
          // [DEPRECATED] We simple .append() the log if it's not commited
          // Appended logs in report will be sent as KVOpAccepted
          // [TODO] Some logic before appending (e.g check term for SPLIT BRAIN)

          report.appended.push(entry);
        }
      }
    }

    return report;
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

    this.bget(key).push({
      log: log,
      token: token,
    });

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
          }, "Node");
          break;
        } else {
          this.send(EMType.KVOpRejected, {
            request: request,
            reason: "Put operation requires value !== undefined",
          }, "Node");
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
          }, "Node");
        } else {
          this.send(EMType.KVOpRejected, {
            request: request,
            reason: `Key ${request.payload.kv.key} not found`,
          }, "Node");
        }
        break;
      }
      default:
        this.send(EMType.KVOpRejected, {
          request: request,
          reason: `KVOp ${request.payload.op} is not implemented`,
        }, "Logger");
    }
  }
}
