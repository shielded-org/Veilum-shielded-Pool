import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";

let initialized = false;

export async function initializeWasm(): Promise<void> {
  if (initialized) return;
  await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
  initialized = true;
}

export function isWasmInitialized(): boolean {
  return initialized;
}
