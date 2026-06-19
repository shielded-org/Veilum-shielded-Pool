import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_BY_PKG = {
    hash3: "HASH3_DIR",
    "note-hash": "NOTE_HASH_DIR",
    hash2: "HASH2_DIR",
};
/** Locate a Noir package (hash3, hash2, note-hash) from monorepo or env. */
export function resolveNoirPackage(packageName) {
    const envKey = ENV_BY_PKG[packageName] ?? `NOIR_${packageName.toUpperCase().replace(/-/g, "_")}_DIR`;
    const explicit = process.env[envKey];
    if (explicit && existsSync(join(explicit, "Nargo.toml")))
        return explicit;
    const root = process.env.NOIR_PACKAGES_ROOT;
    if (root) {
        const fromRoot = join(root, packageName);
        if (existsSync(join(fromRoot, "Nargo.toml")))
            return fromRoot;
    }
    const candidates = [
        join(__dirname, "..", "..", packageName),
        join(__dirname, "..", "..", "..", "packages", packageName),
    ];
    for (const dir of candidates) {
        if (existsSync(join(dir, "Nargo.toml")))
            return dir;
    }
    let cur = __dirname;
    for (let i = 0; i < 12; i++) {
        const dir = join(cur, "packages", packageName);
        if (existsSync(join(dir, "Nargo.toml")))
            return dir;
        const parent = dirname(cur);
        if (parent === cur)
            break;
        cur = parent;
    }
    throw new Error(`Noir package "${packageName}" not found (set ${envKey} or NOIR_PACKAGES_ROOT). Is Nargo installed?`);
}
