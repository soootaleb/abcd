import { EComponent } from "ddapps/enumeration.ts";
import { Messenger } from "ddapps/messenger.ts";
import { KVPeer } from "./kvpeer.ts";
import { EMType } from "ddapps/messages.ts";
import {
  EKVOpType,
  IKVRequestPayload,
  IKVResponsePayload,
} from "./operation.ts";
import { EKVMType, IKVMPayload } from "./messages.ts";
import { IKeyValue, IKVState, ILog } from "./interface.ts";
import { KVM } from "./type.ts";
import { Logger } from "ddapps/logger.ts";

export class Store extends Messenger<
  IKVRequestPayload,
  IKVResponsePayload,
  IKVMPayload,
  IKVState
> {
  public static readonly DEFAULT_DATA_DIR = ".";
  private static readonly WAL_WRITE_INTERVAL = 30;
  private static readonly STORE_WRITE_INTERVAL = 1000;

  constructor(protected state: IKVState) {
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
        let store: { [key: string]: IKeyValue } = {};
        try {
          store = JSON.parse(content || "{}");
        } catch (error) {
          this.send(EMType.LogMessage, {
            message: `Store::WriteStore::ParseError::${error}`,
          }, Logger);
        }
        for (const entry of this.state.store.bwal) {
          const log = entry.log;
          if (log.op === EKVOpType.KVPut) {
            store[log.next.key] = {
              key: log.next.key,
              value: log.next.value,
            };
          } else {
            this.send(EMType.LogMessage, {
              message: `Store::WriteStore::InvalidKVOpType::${log.op}`,
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
    if (entries.length) {
      this.send(EKVMType.StoreLogCommitSuccess, entries, Store);
    }
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
      op: EKVOpType.KVPut,
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
  protected [EKVMType.StoreSyncRequest](
    message: KVM<EKVMType.StoreSyncRequest>,
  ) {
    this.state.store.bwal = message.payload;

    this.send(EMType.LogMessage, {
      message: `Store::StoreSyncRequest::Count::${message.payload.length}`
    }, EComponent.Logger);
  }

  protected [EKVMType.StoreInit](message: KVM<EKVMType.StoreInit>) {
    this.state.store.store = message.payload;
  }

  protected [EKVMType.KVOpRequest](message: KVM<EKVMType.KVOpRequest>) {
    const request = message.payload;
    switch (request.type) {
      case EKVOpType.KVPut: {
        const payload = request.payload as IKVRequestPayload[EKVOpType.KVPut];
        const key = payload.key;
        const value = payload.value;

        if (value !== undefined) {
          // Later we'll need to verify the kv is not in process
          // Otherwise, the request will have to be delayed or rejected (or use MVCC)
          const log = this.put(key, value);

          this.send(EKVMType.KVOpAccepted, {
            log: log,
            token: request.token,
          }, EComponent.Peer);

          this.send(EKVMType.KVOpAccepted, {
            log: log,
            token: request.token,
          }, EComponent.Monitor); // 100%
          break;
        } else {
          this.send(EKVMType.KVOpRejected, {
            request: request,
            reason: `Store::KVOpRequest::Error::ValueUndefined`
          }, EComponent.Peer);
          break;
        }
      }

      case EKVOpType.KVGet: {
        const payload = request.payload as IKVRequestPayload[EKVOpType.KVGet];
        if (
          Object.keys(this.state.store.store).includes(payload)
        ) {
          this.send(EKVMType.KVOpRequestComplete, {
            log: {
              commited: true,
              op: EKVOpType.KVGet,
              timestamp: request.timestamp,
              next: this.get(payload),
            },
            token: request.token,
          }, EComponent.Peer);
        } else {
          this.send(EKVMType.KVOpRejected, {
            request: request,
            reason: `Store::KVOpRequest::Error::KeyUndefined::${payload}`
          }, EComponent.Peer);
        }
        break;
      }
      default:
        this.send(EKVMType.KVOpRejected, {
          request: request,
          reason: `Store::KVOpRequest::Error::InvalidRequestType::${request.type}`
        }, EComponent.Logger);
    }
  }

  protected [EKVMType.KVWatchRequest](message: KVM<EKVMType.KVWatchRequest>) {
    const payload = message.payload.payload as IKVRequestPayload[EKVOpType.KVWatch];
    const key = payload.key;
    const watcher = message.payload.token;
    if (Object.keys(this.state.store.watchers).includes(key)) {
      this.state.store.watchers[key][watcher] = {
        expire: payload.expire
      };
    } else {
      this.state.store.watchers[key] = {
        [watcher]: {
          expire: payload.expire
        }
      };
    }
  }

  protected [EKVMType.StoreLogCommitSuccess](
    message: KVM<EKVMType.StoreLogCommitSuccess>,
  ) {
    for (const entry of message.payload) {
      const key = entry.log.next.key;
      this.state.store.wal.push(entry);
      this.state.store.store[key] = entry.log.next;
      if (Object.keys(this.state.store.watchers).includes(entry.log.next.key)) {
        for (const watcher of Object.keys(this.state.store.watchers[entry.log.next.key])) {
          const expire = this.state.store.watchers[entry.log.next.key][watcher].expire;
          if (expire === 1) {
            this.send(EMType.ClientResponse, {
              token: watcher,
              type: EKVOpType.KVWatch,
              payload: entry.log,
              timestamp: Date.now(),
            }, EComponent.Api);
          } else {
            // expire is set but not finished
            if (expire > 1) this.state.store.watchers[entry.log.next.key][watcher].expire--;

            // set or not finished, send notification
            this.send(EMType.ClientNotification, {
              token: watcher,
              type: EKVOpType.KVWatch,
              payload: entry.log,
              timestamp: Date.now(),
            }, EComponent.Api);
          }
        }
      }
    }
    this.send(EKVMType.StoreLogCommitSuccess, message.payload, KVPeer);
  }

  protected [EKVMType.StoreLogCommitRequest](
    message: KVM<EKVMType.StoreLogCommitRequest>,
  ) {
    this.state.store.bwal.push(message.payload);
  }

  protected [EKVMType.KVOpAccepted](message: KVM<EKVMType.KVOpAccepted>) {
    this.state.store.votes[message.payload.log.next.key] += 1;
  }
}
