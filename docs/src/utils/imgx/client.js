// One dedicated worker, shared by downloads. No keys or image data enter storage.
export function createDecoder({ workerUrl = new URL('./worker.js', import.meta.url), WorkerClass = globalThis.Worker,
    timeoutMs = 60000, startupMs = 10000, idleMs = 30000 } = {}) {
    let worker, starting, readyResolve, readyReject, startupTimer, idleTimer, sequence = 0;
    const pending = new Map();
    function dispose(error = new Error('IMGX decoder stopped')) {
        clearTimeout(startupTimer); clearTimeout(idleTimer);
        worker?.terminate(); worker = undefined;
        readyReject?.(error); readyResolve = readyReject = undefined; starting = undefined;
        for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
        pending.clear();
    }
    function idle() {
        clearTimeout(idleTimer);
        if (!pending.size) idleTimer = setTimeout(() => dispose(), idleMs);
    }
    function ready() {
        if (starting) return starting;
        const promise = starting = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
        try {
            const active = worker = new WorkerClass(workerUrl, { type: 'module', name: 'Emux IMGX' });
            startupTimer = setTimeout(() => dispose(new Error('IMGX worker khởi động quá lâu')), startupMs);
            worker.onerror = worker.onmessageerror = () => {
                if (worker === active) dispose(new Error('IMGX worker gặp lỗi; hãy thử tải lại.'));
            };
            worker.onmessage = ({ data }) => {
                if (worker !== active) return;
                if (data?.ready === 'emux-imgx-v1') {
                    clearTimeout(startupTimer); readyResolve?.(); readyResolve = readyReject = undefined; idle(); return;
                }
                const task = pending.get(data?.id);
                if (!task) return;
                pending.delete(data.id); clearTimeout(task.timer);
                if (data.error || !(data.bytes instanceof ArrayBuffer)) task.reject(new Error(data.error || 'IMGX response invalid'));
                else task.resolve(new Blob([data.bytes], { type: 'image/webp' }));
                idle();
            };
        } catch { dispose(new Error('Không khởi tạo được trình giải mã IMGX')); }
        return promise;
    }
    async function decode(blob, drm) {
        await ready();
        const bytes = await blob.arrayBuffer();
        // Another task may have stopped the worker while this blob was being read.
        await ready(); clearTimeout(idleTimer);
        const id = ++sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => dispose(new Error('Giải mã IMGX quá thời gian; hãy thử tải lại.')), timeoutMs);
            pending.set(id, { resolve, reject, timer });
            try { worker.postMessage({ id, bytes, drm }, [bytes]); }
            catch { dispose(new Error('Không gửi được ảnh tới trình giải mã IMGX')); }
        });
    }
    return { ready, decode, dispose };
}
let shared;
export const ready = () => (shared ||= createDecoder()).ready();
export const decode = (blob, drm) => (shared ||= createDecoder()).decode(blob, drm);
export const dispose = () => { shared?.dispose(); shared = undefined; };
