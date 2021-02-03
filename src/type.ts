import { EMType } from "./enumeration.ts";
import { IMessage } from "./interfaces/interface.ts";

/**
 * EMType Handler (H) is a function accepting an IMessage<EMType>
 */
export type H<T extends EMType> = (message: IMessage<T>) => void
