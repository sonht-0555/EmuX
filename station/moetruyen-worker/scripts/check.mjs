import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chapterId = Number(process.argv[2] || 986);
const base = process.argv[3] || "http://localhost:8787";

try {
    const status = await fetch(new URL("/api/status", base));
    if (status.ok && status.headers.get("content-type")?.includes("json")) {
        console.log("Worker:", (await status.json()).version);
    } else {
        console.log("Worker does not advertise the new version; check the deployment.");
    }
    const endpoint = new URL("/api/v1/manga/45/chapters/1/pages", base);
    endpoint.searchParams.set("requestId", crypto.randomUUID());
    const response = await fetch(endpoint, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.code || "page_access_failed"}: ${result.error || `HTTP ${response.status}`}`);
    const page = result.data?.pages?.[0];
    if (!page?.downloadUrl) throw new Error("Worker returned no image URL.");
    const image = await fetch(page.downloadUrl);
    if (!image.ok) {
        const failure = await image.json().catch(() => ({}));
        throw new Error(`${failure.code || "image_failed"}: ${failure.error || `HTTP ${image.status}`}`);
    }
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") {
        throw new Error("Worker did not return decoded WebP bytes.");
    }
    const output = join(tmpdir(), `emux-chapter-${chapterId}-page-1.webp`);
    await writeFile(output, bytes);
    console.log("Saved page 1:", output);
    console.log("Open this file to verify the manga content visually.");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
