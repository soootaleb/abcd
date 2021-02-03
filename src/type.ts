import { EMTypes } from "./enumeration.ts";
import { IMessage } from "./interface.ts";

/**
 * EMType Handler (H) is a function accepting an IMessage<EMType>
 */
export type H<T extends EMTypes> = (message: IMessage<T>) => void
