import Observe from "https://deno.land/x/Observe/Observe.ts";
import { EMType } from "./src/enumeration.ts";
import Node from "./src/node.ts";

const node: Node = new Node(new Observe({
    type: EMType.InitialMessage,
    source: "Root",
    destination: "Logger",
    payload: null
}));
