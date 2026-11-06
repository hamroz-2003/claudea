// Copies the shared web UI (apps/web-ui) into www/ for Capacitor.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "web-ui");
const dst = join(here, "..", "www");
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
// The service worker is only for the engine-served PWA; the APK ships its files.
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith("sw.js") });
console.log(`web UI copied to ${dst}`);
