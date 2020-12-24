import type { IKeyValue, ILog, IMessage, IWal } from "./interface.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Store {
  private messages: Observe<IMessage>;

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

    this._fwal = Deno.openSync('/app/data/abcd.wal', { write: true });
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

  public wget(key: string): ILog[] {
    if (!(key in this.wal)) {
      this.wal[key] = [];
    }
    return this.wal[key];
  }

  public bget(key: string): ILog[] {
    if (!(key in this._buffer)) {
      this._buffer[key] = [];
    }
    return this._buffer[key];
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  private async persist(log: ILog): Promise<Boolean> {
    // return Promise.resolve(true);
    const bytes = this._encoder.encode(JSON.stringify(log));
    return this._fwal.write(bytes)
      .then((written: number) => {
        return Deno.fsync(this._fwal.rid)
          .then(() => {
            return written === bytes.length;
          })
        
      }).catch(() => false);
  }

  public async commit(log: ILog): Promise<ILog> {

    // [TODO] Commit only if the timestamp (term?) is the highest regarding the key (later use MVCC)

    return this.persist(log)
      .then((ok: Boolean) => {

        const key: string = log.next.key;

        if (ok) {
          this.wget(key).push(log);

          log.commited = true;
      
          this.bget(key).push(log);
      
          this._store[key] = log.next;
          delete this._votes[key];
      
          this.messages.setValue({
            type: "commitSuccess",
            source: "store",
            destination: "log",
            payload: {
              log: log
            },
          });

          return log;
        } else {
          this.messages.setValue({
            type: "commitFail",
            source: "store",
            destination: "log",
            payload: {
              log: log
            }
          });

          return log;
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
    commited: ILog[];
    appended: ILog[];
  }> {
    const report: {
      commited: ILog[];
      appended: ILog[];
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
      for (const log of wal[key].sort((a, b) => a.timestamp < b.timestamp ? -1 : 1)) {

        // We commit if the log is commited
        if (log.commited) {

          // It's important to call .commit() instead of just .append() with log.commited = true
          // That's because later, .commit() will actually perform I/O operations that .append() won't
          await this.commit(log)
            .then((commited: ILog) => {
              if (commited.commited) {
                report.commited.push(log)
              } else {
                this.messages.setValue({
                  type: "commitingLogFailed",
                  source: "store",
                  destination: "log",
                  payload: {
                    log: log
                  }
                })
              }
            });

          report.commited.push(log);
        } else {

          // [DEPRECATED] We simple .append() the log if it's not commited
          // Appended logs in report will be sent as KVOpAccepted
          // [TODO] Some logic before appending (e.g check term for SPLIT BRAIN)

          report.appended.push(log);
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
  public set(key: string, val: string | number): ILog {
    this._votes[key] = 0;

    const log = {
      action: "put" as "put",
      commited: false,
      timestamp: new Date().getTime(),
      previous: this.get(key),
      next: {
        key: key,
        value: val,
      },
    };

    this.bget(key).push(log);

    this.messages.setValue({
      type: "setValueCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        value: val,
      },
    });

    return log;
  }

}
