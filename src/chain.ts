import type { ILog, IMessage, IState } from "./interfaces/interface.ts";
import { EComponent, EMType, ENodeState, EOpType } from "./enumeration.ts";
import Messenger from "./messenger.ts";
import { H } from "./type.ts";
import Logger from "./logger.ts";

import { createHash } from "https://deno.land/std@0.104.0/hash/mod.ts";
import Api from "./api.ts";

export class Block {
  timestamp: number = new Date().getTime();
  tx: Transaction[];
  nonce: number = Math.round((Math.random() * 100));
  hash: string;

  constructor(tx: Transaction[]) {
    this.tx = tx;
    this.hash = this.computeHash();
  }

  private computeHash(): string {
    return createHash("sha256").update(
      this.timestamp.toString() + this.tx.join("") + this.nonce.toString(),
    ).toString();
  }

  public mine(difficulty: number) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
      this.nonce++;
      this.hash = this.computeHash();
    }
  }

  [Symbol.toString()]() {
    return `${this.tx} - ${this.tx.join('\n')}`;
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

  [Symbol.toString()]() {
    return `FROM ${this.from} TO ${this.to} FOR ${this.amount}`;
  }
}

export default class Chain extends Messenger {
  private blocks: Block[] = [];
  
  private static readonly DIFFICULTY = 4;

  [EMType.ChainOpRequest]: H<EMType.ChainOpRequest> = (message) => {
    const block = new Block([
      new Transaction("from", "to", 100),
      new Transaction("to", "from", 50),
      new Transaction("from", "to", 100),
    ]);

    block.mine(Chain.DIFFICULTY);

    this.blocks.push(block);

    this.send(EMType.ClientResponse, {
      ...message.payload,
      payload: {
        ...message.payload.payload,
        blocks: [block]
      }
    }, Api);
  };

  public shutdown() {
    super.shutdown();
    clearTimeout(this.state.electionTimeoutId);
    clearInterval(this.state.heartBeatIntervalId);
  }
}
