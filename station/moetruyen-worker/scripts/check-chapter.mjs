import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { repoPath } from "./repo-path.mjs";

const chapterId = Number(process.argv[2] || 986);
const base = process.argv[3] || "http://localhost:8797";
const source = await readFile(repoPath("station/links/moetruyen.link"), "utf8");
const { default: link } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
link.home = base;
link.mangaId = Number(process.argv[5] || 45);
link._initialized = true;
const chapters = await link.chapters({});
const selected = chapters.find(chapter => chapter.num === Number(process.argv[6] || 1));
if (!selected) throw new Error("Chapter missing from own Worker catalog");
console.log(`Catalog: ${link.mangaId}, ${chapters.length} chapters`);
const output = join(tmpdir(), `emux-moe-${chapterId}`, "C001");

try {
    let failures = 0;
    const corePath = process.argv[4] || "src/core/link.js";
    const sandbox = vm.createContext({
        URL, Blob, Response, AbortController, setTimeout, clearTimeout,
        location: { href: "https://emux.test/", origin: "https://emux.test" },
        document: { currentScript: { src: "https://emux.test/src/core/link.js" } },
        window: {}, local: () => null,
        console: { error: (...args) => { if (failures++ < 3) console.error(args.map(x => String(x).replace(/https?:[^\s]+/g, "[URL omitted]")).join(" ")); } },
        delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
        fetch, link, chapterId, selected,
        onProgress: (count, total) => {
            if (count % 10 === 0 || count === total) console.log(`Decoded ${count}/${total} pages`);
        }
    });
    vm.runInContext(await readFile(repoPath(corePath), "utf8"), sandbox);
    const result = await vm.runInContext("grabPages({manga: link, chapter: selected, context: createContext(false, link.home), onProgress, ask: () => false})", sandbox);
    if (result.skipped || Object.keys(result.files).length !== result.total) throw new Error("Original core did not download every page.");
    await mkdir(output, { recursive: true });
    for (const [name, bytes] of Object.entries(result.files)) await writeFile(join(output, name), Buffer.from(bytes));
    console.log("Saved decoded chapter:", output);
} catch (error) {
    console.error(error.message.replace(/https?:[^\s]+/g, "[URL omitted]"));
    process.exitCode = 1;
}
