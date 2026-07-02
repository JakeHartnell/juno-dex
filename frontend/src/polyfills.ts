import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: {}, browser: true, version: "" } as typeof globalThis.process;
}
