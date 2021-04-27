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
      resolve(false);
    }, 1000);
  
    const test = (ev: Event) => {
      clearInterval(timeout);
  
      const event: CustomEvent = ev as CustomEvent;
      const message: IMessage<EMType> = event.detail;

      if (message.type === current.type) {
        if (typeof current.payload === "object"
          && current.payload != null
          && message.payload != null) {
          assertObjectMatch(current.payload as Record<PropertyKey, unknown>, message.payload as Record<PropertyKey, unknown>);
        } else {
          assertEquals(current.payload, message.payload)
        }
        resolve(true);
      }
    };
  
    addEventListener(current.destination, test);
  }

  messages.send(after.type, after.payload, after.destination);

  return Promise.all(promises).then((ok) => {
    for (let index = 0; index < ok.length; index++) {
      if(!ok[index]) {
        console.error(`🛑 ${expected[index].destination}::${expected[index].type}`)
      }
    }

    return !ok.includes(false);
  })
}

export async function assertMessages(expected: IMessage<EMType>[], after: IMessage<EMType>) {
  assertEquals(true, await expect(expected, after), "Message not received")
}