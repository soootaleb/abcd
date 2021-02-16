import Messenger from "./messenger.ts";
import { EMType, EOpType } from "./enumeration.ts";
import { H } from "./type.ts";

export default class Watcher extends Messenger {

    private watchers: {
        [key: string]: string[]
    } = {};

    [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (message) => {
        if(Object.keys(this.watchers).includes(message.payload.log.next.key)) {
            for (const watcher of this.watchers[message.payload.log.next.key]) {
                this.send(EMType.ClientNotification, {
                    type: EOpType.KVWatch,
                    payload: message.payload.log
                }, watcher)
            }
        }
    }

    public watch(key: string, watcher: string, expire = 1) {
        if(Object.keys(this.watchers).includes(key)) {
            this.watchers[key].push(watcher)
        } else {
            this.watchers[key] = [watcher]
        }
    }
}