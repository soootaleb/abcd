import type { IKeyValue, ILog, IMessage, IWal } from "./interface.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Store {
  private messages: Observe<IMessage>;

  private _wal: IWal = {};
  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};

  constructor(messages: Observe<IMessage>) {
    this.messages = messages;

    this.messages.bind((message: IMessage<any>) => {
      if (message.destination == "store") {
        this.handleMessage(message);
      }
    });
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

  public getVotes(key: string): number {
    return this._votes[key];
  }

  public voteFor(key: string): number {
    let outcome: number = -1;

    if (Object.keys(this._votes).includes(key)) {
      this._votes[key] += 1;
      outcome = this.getVotes(key);
    } else {
      this.wal[key] = this.wget(key).filter((log) => log.commited)
    }

    this.messages.setValue({
      type: "voteForCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        votes: outcome,
      },
    });

    return outcome;
  }

  public wget(key: string): ILog[] {
    if (!(key in this.wal)) {
      this.wal[key] = [];
    }
    return this.wal[key];
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  public commit(log: ILog): ILog {
    const key: string = log.next.key;

    // Now in memory useless
    // [TODO] Append commit to WAL on disk befre stting commited = true]
    // Wall append should be much faster when files i/o are involved
    // [TODO] Commit only if the timestamp is the highest regarding the key (later use MVCC)
    log.commited = true;

    this._store[key] = log.next;
    delete this._votes[key];

    this.messages.setValue({
      type: "commitCall",
      source: "store",
      destination: "log",
      payload: {
        log: log,
      },
    });

    return log;
  }

  public contains(key: string): Boolean {
    return Object.keys(this._store).includes(key);
  }

  public sync(wal: IWal): Boolean {
    // For each key of the store
    for (const key in wal) {
      // Remove uncommited staged logs
      this.wal[key] = this.wget(key).filter((log) => log.commited);

      // We sort comming the logs chrono
      const logs = wal[key]
        .filter((log) => log.commited)
        .sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);

      // We sort the stagged logs chrono
      const stagged = this.wget(key).sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : 1
      );

      let unstagged: ILog[] = logs;

      // We may find the latest & filter the comming logs
      if (stagged.length) {
        const latest = stagged.reverse()[0];
        unstagged = logs.filter((log) => log.timestamp > latest.timestamp);
      }

      // Finally we commit all unstagged
      for (const log of unstagged) {
        this.messages.setValue({
          type: "commitUnstaggedLog",
          source: "store",
          destination: "log",
          payload: {
            unstagged: log,
            previous: this.wal,
          },
        });

        this.commit(log);
      }
    }

    return true;
  }

  /**
   * Puts in pending & initializes votes
   * Call .commit() in order to persist in the store
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

    this.wget(key).push(log);

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
