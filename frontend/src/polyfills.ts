import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {},
    browser: true,
    version: "",
    nextTick: (callback: () => void) => Promise.resolve().then(callback),
  } as typeof globalThis.process;
}
