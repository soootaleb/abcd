import { Transaction } from "./transaction.ts";
import { createHash } from "std/hash/mod.ts";

export class Block {

  public nonce = 0;
  public timestamp: number = new Date().getTime();
  public prev: string;
  public hash: string;
  public transactions: Transaction[];

  constructor(
    transactions: Transaction[],
    prev: string,
    timestamp: number = new Date().getTime(),
    nonce: number = 0,
  ) {
    this.transactions = transactions.map((tx) =>
      new Transaction(tx.from, tx.to, tx.amount)
    );
    this.prev = prev;
    this.timestamp = timestamp;
    this.nonce = nonce;
    this.hash = this.computeHash();
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
    this.transactions.push(tx);
  }

  public verify(difficulty: number): boolean {
    return this.hash.substring(0, difficulty) ===
      Array(difficulty + 1).join("0");
  }

  public next(transactions: Transaction[]): Block {
    return new Block(transactions, this.hash);
  }

  public toString = (): string => {
    return this.transactions.map((o) => o.toString()).join("\n");
  };

  private computeHash(): string {
    return createHash("sha256").update(
      this.timestamp.toString() + this.transactions.join("") +
        this.nonce.toString(),
    ).toString();
  }
}
