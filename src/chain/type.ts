import { M } from "ddapps/type.ts";
import { ICRequestPayload, ICResponsePayload } from "./interface.ts";
import { ICMPayload } from "./messages.ts";

// [OK] User needs to declare the payload typing function
export type CM<T extends keyof ICMPayload> = M<
  T,
  ICRequestPayload,
  ICResponsePayload,
  ICMPayload
>;
