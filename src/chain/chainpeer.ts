import { Api } from "ddapps/api.ts";
import { Logger } from "ddapps/logger.ts";
import { Block } from "./block.ts";
import { Transaction } from "./transaction.ts";
import { Peer } from "ddapps/peer.ts";
import { CM } from "./type.ts";
import { ECOpType, ICRequestPayload, ICResponsePayload } from "./operation.ts";
import { IChainState } from "./chainstate.ts";
import { ECMType, ICMPayload } from "./messages.ts";
import { EMType } from "ddapps/messages.ts";

export  class ChainPeer
  extends Peer<ICRequestPayload, ICResponsePayload, ICMPayload, IChainState> {
  private genesis: Block = new Block([], "genesis-block-prev-hash", 0, 0);
  private blocks: Block[] = [this.genesis];
  private pending: Block = new Block([], this.genesis.hash);

  private static readonly DIFFICULTY = 2;

  constructor(protected state: IChainState) {
    super(state);

    setInterval(() => {
      if (this.pending.transactions.length) {
        this.pending.mine(ChainPeer.DIFFICULTY);
        this.blocks.push(this.pending);
        this.peers.send(ECMType.NewBlock, this.pending)
        this.pending = this.pending.next([]);
      }
    }, 100);
  }

  protected [ECMType.ChainSumRequest](message: CM<ECMType.ChainSumRequest>) {
    const balances: { [key: string]: number } = {};
    for (const block of this.blocks) {
      for (const transaction of block.transactions) {
        if (!Object.keys(balances).includes(transaction.from)) {
          balances[transaction.from] = 0;
        }
        if (!Object.keys(balances).includes(transaction.to)) {
          balances[transaction.to] = 0;
        }
        balances[transaction.from] -= transaction.amount;
        balances[transaction.to] += transaction.amount;
      }
    }
    this.send(EMType.ClientResponse, {
      ...message.payload,
      payload: balances,
    }, Api);
  }

  protected [ECMType.ChainAddRequest](message: CM<ECMType.ChainAddRequest>) {
    const payload = message.payload.payload as ICRequestPayload[ECOpType.TxAdd];
    const tx = new Transaction(payload.from, payload.to, payload.amount);
    this.pending.TxAdd(tx);
    this.peers.send(ECMType.NewTransaction, tx);
    this.send(EMType.ClientResponse, message.payload, Api);
  }

  protected [ECMType.ChainGetRequest](message: CM<ECMType.ChainGetRequest>) {
    this.send(EMType.LogMessage, {
      message: this.blocks.join("\n"),
    }, Logger);
    this.send(EMType.ClientResponse, {
      ...message.payload,
      payload: this.blocks,
    }, Api);
  }

  protected [ECMType.NewTransaction](message: CM<ECMType.NewTransaction>) {
    this.pending.TxAdd(
      new Transaction(
        message.payload.from,
        message.payload.to,
        message.payload.amount,
      ),
    );
    this.send(EMType.LogMessage, {
      message: `[TxAdd] ${message.payload.toString()}`,
    }, Logger);
  }

  protected [ECMType.NewBlock](message: CM<ECMType.NewBlock>) {
    const block = new Block(
      message.payload.transactions,
      message.payload.prev,
      message.payload.timestamp,
      message.payload.nonce,
    );

    const verified = block.verify(ChainPeer.DIFFICULTY);

    if (
      verified &&
      this.blocks.at(this.blocks.length - 1)?.hash === block.prev
    ) {
      this.blocks.push(block);
      this.send(EMType.LogMessage, {
        message: `[NewBlockAccepted] ${block.toString()}`,
      }, Logger);
      this.pending = block.next([]);
    } else {
      this.send(EMType.LogMessage, {
        message: `[NewBlockRejected] ${block.toString()}`,
      }, Logger);
    }
  }
}
