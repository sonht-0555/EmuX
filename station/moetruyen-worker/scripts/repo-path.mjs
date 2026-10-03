import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.EMUX_ROOT || fileURLToPath(new URL("../../../", import.meta.url));
export const repoPath = relative => resolve(root, relative);
