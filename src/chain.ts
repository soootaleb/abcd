import { EChainOpType, EMType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";

import { createHash } from "https://deno.land/std@0.104.0/hash/mod.ts";
import Api from "./api.ts";
import { ICOPayload, IState } from "./interfaces/interface.ts";
import Logger from "./logger.ts";

export class Block {
  private timestamp: number = new Date().getTime();
  private tx: Transaction[];
  private nonce: number = Math.round((Math.random() * 100));
  private hash: string;

  constructor(tx: Transaction[]) {
    this.tx = tx;
    this.hash = this.computeHash();
  }

  public get transations(): Transaction[] {
    return this.tx;
  }

  private computeHash(): string {
    return createHash("sha256").update(
      this.timestamp.toString() + this.tx.join("") + this.nonce.toString(),
    ).toString();
  }

  public mine(difficulty: number): Block {
    while (
      this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")
    ) {
      this.nonce++;
      this.hash = this.computeHash();
    }

    return this;
  }

  public TxAdd(tx: Transaction): void {
    this.tx.push(tx);
  }

  public toString(): string {
    return `${this.tx} - ${this.tx.join("\n")}`;
  }

  [Symbol.toString()](): string {
    return `${this.tx} - ${this.tx.join("\n")}`;
  }
}

export class Transaction {
  to: string;
  from: string;
  amount: number;

  constructor(from: string, to: string, amount: number) {
    this.to = to;
    this.from = from;
    this.amount = amount;
  }

  public toString(): string {
    return `FROM ${this.from} TO ${this.to} FOR ${this.amount}`;
  }

  [Symbol.toString()](): string {
    return `FROM ${this.from} TO ${this.to} FOR ${this.amount}`;
  }
}

export default class Chain extends Messenger {
  private blocks: Block[] = [];
  private pending: Block = new Block([]);

  private static readonly DIFFICULTY = 2;

  constructor(state: IState) {
    super(state);

    setInterval(() => {
      if(this.pending.transations.length) {
        this.pending.mine(Chain.DIFFICULTY);
        this.blocks.push(this.pending);
        this.pending = new Block([]);
      }
    }, 2000);
  }

  [EMType.ChainOpRequest]: H<EMType.ChainOpRequest> = (message) => {
    switch (message.payload.payload.op) {
      case EChainOpType.TxAdd: {
        const payload = message.payload.payload
          .payload as ICOPayload[EChainOpType.TxAdd];
        const tx = new Transaction(payload.from, payload.to, payload.amount);
        this.pending.TxAdd(tx);
        this.send(EMType.ClientResponse, message.payload, Api);
        break;
      }
      case EChainOpType.TxGet: {
        this.send(EMType.LogMessage, {
          message: this.blocks.join("\n")
        }, Logger)
        this.send(EMType.ClientResponse, message.payload, Api);
        break;
      }
      case EChainOpType.TxSum: {
        const balances: { [key: string]: number } = {};
        for (const block of this.blocks) {
          for (const transaction of block.transations) {
            if(!Object.keys(balances).includes(transaction.from)) {
              balances[transaction.from] = 0
            }
            if(!Object.keys(balances).includes(transaction.to)) {
              balances[transaction.to] = 0
            }
            balances[transaction.from] -= transaction.amount;
            balances[transaction.to] += transaction.amount;
          }
        }
        console.dir(balances)
        this.send(EMType.LogMessage, {
          message: balances.toString()
        }, Logger)
        this.send(EMType.ClientResponse, message.payload, Api);
        break;
      }
      default:
        this.send(EMType.InvalidClientRequestType, {
          invalidType: message.payload.payload.op,
        }, Api);
    }
  };

  public shutdown() {
    super.shutdown();
    clearTimeout(this.state.electionTimeoutId);
    clearInterval(this.state.heartBeatIntervalId);
  }

  [Symbol.toString()](): string {
    return this.blocks.toString()
  }

  public toString(): string {
    return this.blocks.toString()
  }
}
