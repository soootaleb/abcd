import { EMType } from "../src/enumeration.ts";
import Messenger from "../src/messenger.ts";
import { assertEquals, assertObjectMatch } from "https://deno.land/std/testing/asserts.ts";
import { state } from "../src/state.ts";
import { IMessage } from "../src/interfaces/interface.ts";

export function expect(expected: IMessage<EMType>, after: IMessage<EMType>) {
  let received = false;
  const messages = new Messenger({ ...state });

  const test = (ev: Event) => {
    const event: CustomEvent = ev as CustomEvent;
    const message: IMessage<EMType> = event.detail;

    received = true;

    assertObjectMatch({ ...expected.payload }, { ...message.payload });
    assertEquals(expected.type, message.type);
  };

  addEventListener(expected.destination, test);
  messages.send(after.type, after.payload, after.destination);
  assertEquals(true, received, "Message not received");
  removeEventListener(expected.destination, test);
}
