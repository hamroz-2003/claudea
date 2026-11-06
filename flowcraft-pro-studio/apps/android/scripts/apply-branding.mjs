// Replaces Capacitor's default launcher icons and white splash with FlowCraft branding.
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android", "app", "src", "main", "res");
if (!existsSync(res)) throw new Error("Run `npx cap add android` first");

cpSync(join(root, "resources"), res, { recursive: true });
writeFileSync(join(res, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0C0E</color>\n</resources>\n`);
writeFileSync(join(res, "values", "flowcraft_colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="flowcraft_bg">#0B0C0E</color>\n</resources>\n`);
for (const dir of readdirSync(res)) {
  if (dir.startsWith("drawable") && existsSync(join(res, dir, "splash.png"))) rmSync(join(res, dir, "splash.png"));
}
writeFileSync(join(res, "drawable", "splash.xml"), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/flowcraft_bg" />
    <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher_foreground" /></item>
</layer-list>
`);
console.log("branding applied");
