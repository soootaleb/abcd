import Messenger from "./messenger.ts";
import Node from "./node.ts";
import Observe from "https://deno.land/x/Observe/Observe.ts";
import { IMessage } from "./interfaces/interface.ts";
import { EMType } from "./enumeration.ts";
import { H } from "./type.ts";


export default class Monitor extends Messenger {

    private requests: string[] = [];
    private answered = 0;
    private commited = 0;
    private accepted = 0;
    private rejected = 0;
    private debugger = 0;


    constructor(messages: Observe<IMessage<EMType>>) {
        super(messages);

        this.messages.bind((message) => {
            // deno-lint-ignore no-explicit-any
            const o: any = message;
            if (message.type === EMType.ClientRequest) {
                this.requests.push(o.payload.token);
            } else if (message.type === EMType.ClientResponse) {
                if(this.requests.includes(o.payload.token)) {
                    this.answered++;
                }
            }
        })

        setInterval(() => {
            console.clear();
            console.log(this.requests.length)
            console.log("DEBUG", this.debugger / this.requests.length)
            console.log("ACCEPTED", this.accepted / this.requests.length)
            console.log("COMMITED", this.commited / this.requests.length)
            console.log("REJECTED", this.rejected / this.requests.length)
            console.log("TOTAL", (this.rejected + this.commited) / this.requests.length)
            console.log("ANSWERED", this.answered / this.requests.length )
        }, 100);
    }

    [EMType.KVOpAccepted]: H<EMType.KVOpAccepted> = (message) => {
        this.accepted++;
    }

    [EMType.StoreLogCommitSuccess]: H<EMType.StoreLogCommitSuccess> = (message) => {
        this.commited++;
    }

    [EMType.StoreLogCommitFail]: H<EMType.StoreLogCommitFail> = (message) => {
        this.rejected++;
    }

    [EMType.LogMessage]: H<EMType.LogMessage> = (message) => {
        this.debugger++;
    }
}