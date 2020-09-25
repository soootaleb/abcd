import type { IKeyValue, ILog, IMessage, IWal } from "./interface.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";

export default class Store {
  private messages: Observe<IMessage>;

  private _wal: IWal = {};
  private _votes: { [key: string]: number } = {};
  private _store: { [key: string]: IKeyValue } = {};
  private _pending: { [key: string]: ILog } = {};

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
      // case "newConnection":
      //   this._peers[message.payload.peerPort] = message.payload;
      //   this.messages.setValue({
      //     type: message.type,
      //     source: "net",
      //     destination: "node",
      //     payload: message.payload,
      //   });
      //   break;
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
    this._pending = {};
  }

  public get pending(): { [key: string]: ILog } {
    return this._pending;
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
    }

    this.messages.setValue({
      type: "voteForCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        votes: outcome
      }
    })

    return outcome;
  }

  public get(key: string): IKeyValue {
    return this._store[key];
  }

  public commit(log: ILog): Boolean {

    const key: string = log.next.key;
    // Now in memory useless
    // But wall append should be largely faster when files i/o are involved
    if (!Object.keys(this._wal).includes(key)) {
        this._wal[key] = [];
    }
    this._wal[key].push(this._pending[key]);
    this._store[key] = this._pending[key].next;
    delete this._pending[key];
    delete this._votes[key];


    this.messages.setValue({
      type: "commitCall",
      source: "store",
      destination: "log",
      payload: {
        key: key
      }
    })

    return true;
  }

  public contains(key: string): Boolean {
    return Object.keys(this._store).includes(key);
  }

  /**
   * Puts in pending & initializes votes
   * Call .commit() in order to persist in the store
   * @param key 
   * @param val 
   */
  public set(key: string, val: string | number): Boolean {
    this._votes[key] = 1;
    this._pending[key] = {
      action: "put",
      timestamp: new Date().getTime(),
      previous: this._store[key],
      next: {
        key: key,
        value: val,
      },
    };

    this.messages.setValue({
      type: "setValueCall",
      source: "store",
      destination: "log",
      payload: {
        key: key,
        value: val
      }
    })

    return true;
  }
}
