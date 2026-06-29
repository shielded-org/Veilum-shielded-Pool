import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webPublic = join(root, "..", "web", "public");

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { force: true });
}

const pairs = [
  ["deployment.json", "deployment.json"],
  ["config/networks.json", "config/networks.json"],
  ["circuits/hash2.json", "circuits/hash2.json"],
  ["circuits/note_hash.json", "circuits/note_hash.json"],
  ["circuits/shielded_transfer.json", "circuits/shielded_transfer.json"],
  ["circuits/shielded_transfer_asp.json", "circuits/shielded_transfer_asp.json"],
];

for (const [relSrc, relDest] of pairs) {
  const src = join(webPublic, relSrc);
  const dest = join(root, "public", relDest);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  copy(src, dest);
  console.log(`synced ${relDest}`);
}
