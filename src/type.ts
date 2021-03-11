import { EMType } from "./enumeration.ts";
import { ILog, IMessage } from "./interfaces/interface.ts";

/**
 * EMType Handler (H) is a function accepting an IMessage<EMType>
 */
export type H<T extends EMType> = (message: IMessage<T>) => void

export type TWal = {log: ILog, token: string}[];