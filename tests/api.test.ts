import { state } from "../src/state.ts";
import Api from "../src/api.ts";
import { EComponent, EKVOpType, EMonOpType, EMType, EOpType } from "../src/enumeration.ts";
import { expect } from "./helpers.ts";

new Api({...state})

// Deno.test("Api::ClientRequest::KVOp", () => {

//   expect({
//     type: EMType.KVOpRequest,
//     destination: EComponent.Node,
//     payload: {
//       token: 'token',
//       type: EOpType.KVOp,
//       timestamp: 1234567890,
//       payload: {
//         op: EKVOpType.Get,
//         kv: {
//           key: 'key',
//           value: 'value'
//         }
//       }
//     },
//     source: "Source"
//   }, {
//     type: EMType.ClientRequest,
//     destination: EComponent.Api,
//     payload: {
//       token: 'token',
//       type: EOpType.KVOp,
//       timestamp: 1234567890,
//       payload: {
//         op: EKVOpType.Get,
//         kv: {
//           key: 'key',
//           value: 'value'
//         }
//       }
//     },
//     source: "Source"
//   })
// });

// Deno.test("Api::ClientRequest::KVWatch", () => {

//   expect({
//     type: EMType.KVWatchRequest,
//     destination: EComponent.Store,
//     payload: {
//       token: 'token',
//       type: EOpType.KVWatch,
//       timestamp: 1234567890,
//       payload: {
//         expire: 1,
//         key: 'key'
//       }
//     },
//     source: "Source"
//   }, {
//     type: EMType.ClientRequest,
//     destination: EComponent.Api,
//     payload: {
//       token: 'token',
//       type: EOpType.KVWatch,
//       timestamp: 1234567890,
//       payload: {
//         expire: 1,
//         key: 'key'
//       }
//     },
//     source: "Source"
//   })
// });

// Deno.test("Api::ClientRequest::MonOp", () => {

//   expect({
//     type: EMType.MonOpRequest,
//     destination: EComponent.Monitor,
//     payload: {
//       token: 'token',
//       type: EOpType.MonOp,
//       timestamp: 1234567890,
//       payload: {
//         op: EMonOpType.Get,
//         metric: { key: 'metric' }
//       }
//     },
//     source: "Source"
//   }, {
//     type: EMType.ClientRequest,
//     destination: EComponent.Api,
//     payload: {
//       token: 'token',
//       type: EOpType.MonOp,
//       timestamp: 1234567890,
//       payload: {
//         op: EMonOpType.Get,
//         metric: { key: 'metric' }
//       }
//     },
//     source: "Source"
//   })
// });

// Deno.test("Api::ClientRequest::MonOp", () => {
//   expect({
//     type: EMType.MonWatchRequest,
//     destination: EComponent.Monitor,
//     payload: {
//       token: 'token',
//       type: EOpType.MonWatch,
//       timestamp: 1234567890,
//       payload: {
//         key: 'key',
//         expire: 1
//       }
//     },
//     source: "Source"
//   }, {
//     type: EMType.ClientRequest,
//     destination: EComponent.Api,
//     payload: {
//       token: 'token',
//       type: EOpType.MonWatch,
//       timestamp: 1234567890,
//       payload: {
//         key: 'key',
//         expire: 1
//       }
//     },
//     source: "Source"
//   })
// });