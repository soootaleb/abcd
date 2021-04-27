import { EMType } from "../src/enumeration.ts";
import Messenger from "../src/messenger.ts";
import { assertEquals, assertObjectMatch } from "https://deno.land/std/testing/asserts.ts";
import { state } from "../src/state.ts";
import { IMessage } from "../src/interfaces/interface.ts";

export function expect(expected: IMessage<EMType>[], after: IMessage<EMType>) {

  const messages = new Messenger({ ...state });
  const promises = [];

  for (const current of expected) {
    
    if(current.destination === after.destination) {
      console.warn("🚨 SELF MESSAGE FOR " + current.destination)
    }
  
    let resolve: (v: unknown) => void;
    const p = new Promise((r) => resolve = r);
    
    promises.push(p);
  
    const timeout = setTimeout(() => {
      removeEventListener(current.destination, test);
      resolve(false);
    }, 100); 

    const test = (ev: Event) => {
      clearInterval(timeout);
  
      const event: CustomEvent = ev as CustomEvent;
      const message: IMessage<EMType> = event.detail;

      assertObjectMatch({
        ...current
      } as Record<PropertyKey, unknown>, {
        ...message
      } as Record<PropertyKey, unknown>);

      resolve(true);
    };
  
    addEventListener(current.destination, test, {
      once: true
    });
  }

  messages.send(after.type, after.payload, after.destination, after.source);

  return Promise.all(promises).then((ok) => {
    for (let index = 0; index < ok.length; index++) {
      if(!ok[index]) {
        console.error(`🛑 ${expected[index].destination}::${expected[index].type}`)
      }
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
  assertEquals(true, await expect(expected, after), "Message not received")
}