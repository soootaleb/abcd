import { EMType } from "../src/enumeration.ts";
import Messenger from "../src/messenger.ts";
import { assertEquals, assertObjectMatch } from "https://deno.land/std/testing/asserts.ts";
import { state } from "../src/state.ts";
import { IMessage } from "../src/interfaces/interface.ts";

export function expect(expected: IMessage<EMType>[], after: IMessage<EMType>) {

  const messages = new Messenger({ ...state });
  const promises = [];
  const tests: {[key: string]: (ev: Event) => void} = {};

  for (const current of expected) {
  
    let resolve: (v: unknown) => void;
    const p = new Promise((r) => resolve = r);
    
    promises.push(p);
  
    const timeout = setTimeout(() => {
      removeEventListener(current.destination, tests[current.destination+current.type]);
      resolve(false);
    }, 1000); 

    tests[current.destination+current.type] = (ev: Event) => {
      
      const event: CustomEvent = ev as CustomEvent;
      const message: IMessage<EMType> = event.detail;

      if (
        message.destination === after.destination
        && message.source === after.source
        && message.type === after.type
      ) return;
      
      clearInterval(timeout);

      assertObjectMatch({
        ...message
      } as Record<PropertyKey, unknown>, {
        ...current
      } as Record<PropertyKey, unknown>);

      resolve(true);
    };
  
    addEventListener(current.destination, tests[current.destination+current.type]);
  }

  messages.send(after.type, after.payload, after.destination, after.source);

  return Promise.all(promises).then((ok) => {
    for (let index = 0; index < ok.length; index++) {
      if(!ok[index]) {
        console.error(`🛑 ${expected[index].destination}::${expected[index].type}`)
      }
    }

    for (const current of expected) {
      removeEventListener(current.destination, tests[current.destination+current.type])
    }

    return !ok.includes(false);
  })
}

/**
 * assert a list of messages are emited after a given message is sent
 * @param expected - The list of expected messages
 * @param after - The message sent as a trigger
 */
export async function assertMessages(expected: IMessage<EMType>[], after: IMessage<EMType>) {
  assertEquals(await expect(expected, after), true, "Message not received")
}