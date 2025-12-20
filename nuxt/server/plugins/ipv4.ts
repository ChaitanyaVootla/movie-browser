import { Agent, setGlobalDispatcher } from "undici";

export default defineNitroPlugin(() => {
  // Force Undici (fetch/$fetch) to use IPv4
  setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
  console.log("[nuxt] fetch pinned to IPv4");
});
