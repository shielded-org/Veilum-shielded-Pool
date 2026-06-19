import { type Hex32 } from "./types.js";
export declare function executeNoirWasm(circuitName: string, inputs: Record<string, string | boolean>): Promise<Hex32>;
