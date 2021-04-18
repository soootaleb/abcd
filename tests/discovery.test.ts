// import { state } from "../src/state.ts";
// import { EComponent, EMType } from "../src/enumeration.ts";
// import { expect } from "./helpers.ts";
// import Discovery from "../src/discovery.ts";
// import { IMessage, IOPayload, IState } from "../src/interfaces/interface.ts";
// import {
//   assertEquals,
//   assertObjectMatch,
// } from "https://deno.land/std/testing/asserts.ts";
// import { IMPayload } from "../src/interfaces/mpayload.ts";

// const s: IState = { ...state };

// Deno.test("Discovery::DiscoveryBeaconSend::NotReady", () => {
//   new Discovery({
//     ...s,
//     discovery: {
//       ...s.discovery,
//       ready: false,
//     },
//   });

//   const payload: IMPayload[EMType.DiscoveryBeaconSend] = null;

//   const message: IMessage<EMType.DiscoveryBeaconSend> = {
//     type: EMType.DiscoveryBeaconSend,
//     source: "Source",
//     destination: EComponent.Discovery,
//     payload: payload,
//   };

//   expect({
//     ...message,
//     type: EMType.DiscoveryBeaconSendFail,
//     destination: EComponent.Logger,
//     payload: {
//       ready: false,
//       reason: "discoveryServiceNotReady",
//     },
//   }, message);
// });

// Deno.test("Discovery::DiscoveryBeaconSend:Ready", () => {
//   new Discovery({
//     ...s,
//     discovery: {
//       ...s.discovery,
//       ready: true,
//     },
//   });

//   const payload: IMPayload[EMType.DiscoveryBeaconSend] = null;

//   const message: IMessage<EMType.DiscoveryBeaconSend> = {
//     type: EMType.DiscoveryBeaconSend,
//     source: "Source",
//     destination: EComponent.Discovery,
//     payload: payload,
//   };

//   expect({
//     ...message,
//     type: EMType.DiscoveryBeaconSend,
//     destination: EComponent.DiscoveryWorker,
//     payload: null,
//   }, message);
// });
