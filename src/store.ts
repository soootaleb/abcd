import type { IKeyValue, ILog, IMessage, IWal } from "./interface.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Store {
  private messages: Observe<IMessage>;

  private static GC_FLUSH_TIMEOUT = 600000;
  private static readonly STORE_DATA_DIR = new URL('..', import.meta.url).pathname + "data/"
    
  private _wal: IWal = {};
  private _buffer: IWal = {};
  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};

  private _fwal: Deno.File;
  private _encoder: TextEncoder;

  public get buffer() {
    const outcome = {...this._buffer};
    this._buffer = {};
    return outcome;
  }

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "store") {
        this.handleMessage(message);
      }
    });

    this._encoder = new TextEncoder();

    this._fwal = Deno.openSync(Store.STORE_DATA_DIR + 'abcd.wal', { append: true, create: true });
    
    setInterval(() => {

      this.messages.setValue({
        type: "gcFlush",
        source: "store",
        destination: "log",
        payload: {
          wal: Object.keys(this._wal).length,
          store: Object.keys(this._store).length,
        }
      })

      this._wal = {};
      this._store = {};

    }, Store.GC_FLUSH_TIMEOUT);
  }

  private handleMessage(message: IMessage) {
    switch (message.type) {
      default:
        this.messages.setValue({
          type: "invalidMessageType",
          source: "store",
          destination: "log",
          payload: {
            message: message,
          },
        });
        break;
    }
  }

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

    this.messages.setValue({
      type: "voteForCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        votes: this._votes[key],
      },
    });

    return this._votes[key];
  }

  private wget(key: string): {log: ILog, token: string}[] {
    if (!(key in this.wal)) {
      this.wal[key] = [];
    }
    return this.wal[key];
  }

  public bget(key: string): {log: ILog, token: string}[] {
    if (!(key in this._buffer)) {
      this._buffer[key] = [];
    }
    return this._buffer[key];
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  private async persist(entry: {
    log: ILog,
    token: string
  }): Promise<Boolean> {
    // return Promise.resolve(true);
    const bytes = this._encoder.encode(JSON.stringify(entry.log));
    return this._fwal.write(bytes)
      .then((written: number) => {
        return Deno.fsync(this._fwal.rid)
          .then(() => {
            return written === bytes.length;
          })
        
      }).catch(() => false);
  }
  public async commit(entry: {
    log: ILog,
    token: string
  }): Promise<{
    log: ILog,
    token: string
  }> {
    const key: string = entry.log.next.key;
    // const log = entry.log

    // [TODO] Commit only if the timestamp (term?) is the highest regarding the key (later use MVCC)

    return this.persist(entry)
      .then((ok: Boolean) => {

        const key: string = entry.log.next.key;

        if (ok) {
          this.wget(key).push(entry);

          entry.log.commited = true;
      
          this.bget(key).push(entry);
      
          this._store[key] = entry.log.next;
          delete this._votes[key];
      
          this.messages.setValue({
            type: "commitSuccess",
            source: "store",
            destination: "log",
            payload: entry,
          });

          return entry;
        } else {
          this.messages.setValue({
            type: "commitFail",
            source: "store",
            destination: "log",
            payload: entry
          });

          return entry;
        }
      })
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
  public async sync(wal: IWal): Promise<{
    commited: {log: ILog, token: string}[];
    appended: {log: ILog, token: string}[];
  }> {
    const report: {
      commited: {log: ILog, token: string}[];
      appended: {log: ILog, token: string}[];
    } = {
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
      for (const entry of wal[key].sort((a, b) => a.log.timestamp < b.log.timestamp ? -1 : 1)) {

        // We commit if the log is commited
        if (entry.log.commited) {

          // It's important to call .commit() instead of just .append() with log.commited = true
          // That's because later, .commit() will actually perform I/O operations that .append() won't
          await this.commit(entry)
            .then((entry: {log: ILog, token: string}) => {
              if (entry.log.commited) {
                report.commited.push(entry)
              } else {
                this.messages.setValue({
                  type: "commitingLogFailed",
                  source: "store",
                  destination: "log",
                  payload: entry
                })
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
      action: "put",
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
      token: token
    });

    this.messages.setValue({
      type: "putValueCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        value: val,
        token: token
      },
    });

    return log;
  }

}
