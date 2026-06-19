import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function toolEnv(): NodeJS.ProcessEnv {
  const extra = [
    process.env.NOIR_TOOLCHAIN_BIN,
    join(homedir(), ".nargo/bin"),
    join(homedir(), ".bb/bin"),
  ]
    .filter(Boolean)
    .join(":");
  return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ""}` };
}

export function hasNargoCli(): boolean {
  try {
    execFileSync("nargo", ["--version"], { stdio: "ignore", env: toolEnv() });
    return true;
  } catch {
    return false;
  }
}
