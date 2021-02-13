import Messenger from "./messenger.ts";
import type Observe from "https://deno.land/x/Observe/Observe.ts";
import type { IMessage, IKVWatch } from "./interfaces/interface.ts";
import { EKVOpType, EMType, EOpType } from "./enumeration.ts";
import { IMPayload } from "./interfaces/mpayload.ts";

export default class Watcher extends Messenger {

    private watchers: {
        [key: string]: string[]
    } = {}

    constructor(messages: Observe<IMessage<EMType>>) {
        super(messages);

        this.messages.bind((message) => {
            if(message.type === EMType.KVOpRequestComplete) {
                const payload = message.payload as IMPayload[EMType.KVOpRequestComplete];
                if(Object.keys(this.watchers).includes(payload.log.next.key)) {
                    for (const watcher of this.watchers[payload.log.next.key]) {
                        this.send(EMType.ClientNotification, {
                            type: EOpType.KVWatch,
                            payload: payload.log
                        }, watcher)
                    }
                }
            }
        })
    }

    public watch(key: string, watcher: string, expire = 1) {
        if(Object.keys(this.watchers).includes(key)) {
            this.watchers[key].push(watcher)
        } else {
            this.watchers[key] = [watcher]
        }
    }
}