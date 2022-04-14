export class Transaction {
  public to: string;
  public from: string;
  public amount: number;

  constructor(from: string, to: string, amount: number) {
    this.to = to;
    this.from = from;
    this.amount = amount;
  }

  public toString(): string {
    return `${this.from}-${this.amount}->${this.to}`;
  }
}
