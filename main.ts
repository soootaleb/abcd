import Observe from "https://deno.land/x/Observe/Observe.ts";
import { EComponent, EMType } from "./src/enumeration.ts";
import Node from "./src/node.ts";

const messages = new Observe({
    type: EMType.InitialMessage,
    source: "Root",
    destination: EComponent.Logger,
    payload: null
})
const node: Node = new Node(messages);