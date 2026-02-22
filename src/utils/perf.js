// ===== Performance Tool =====
window.Perf = {
    enabled: false, lastReportTime: performance.now(),
    samples: {count: 0, backlog: 0, backlogCount: 0},
    video: {frames: 0, skipped: 0, gpuTime: 0, lastGpuStart: 0},
    cpu: {totalWorkTime: 0, lastFrameStart: 0},
    // ===== toggle =====
    toggle() {
        this.enabled = !this.enabled;
        console.log(`Perf Diagnostics: ${this.enabled ? 'ON' : 'OFF'}`);
        this.reset();
    },
    // ===== reset =====
    reset() {
        this.samples = {count: 0, backlog: 0, backlogCount: 0};
        this.video = {frames: 0, skipped: 0, gpuTime: 0, lastGpuStart: 0};
        this.cpu.totalWorkTime = this.cpu.lastFrameStart = 0;
    },
    // ===== countAudio =====
    countAudio(frames) {if (this.enabled) this.samples.count += frames;},
    // ===== beginGpu =====
    beginGpu() {if (this.enabled) this.video.lastGpuStart = performance.now();},
    // ===== endGpu =====
    endGpu() {
        if (this.enabled && this.video.lastGpuStart > 0) {
            this.video.gpuTime += (performance.now() - this.video.lastGpuStart);
            this.video.lastGpuStart = 0;
        }
    },
    // ===== beginCore =====
    beginCore() {if (this.enabled) this.cpu.lastFrameStart = performance.now();},
    // ===== endCore =====
    endCore() {
        if (this.enabled && this.cpu.lastFrameStart > 0) {
            this.cpu.totalWorkTime += (performance.now() - this.cpu.lastFrameStart);
            this.cpu.lastFrameStart = 0;
        }
    },
    // ===== report =====
    report(scriptName, coreRuns) {
        const now = performance.now(), elapsed = now - this.lastReportTime;
        this.lastReportTime = now;
        if (this.enabled) {
            const speedPct = Math.min(100, (1000 / elapsed) * 100) | 0,
                avgCpu = (this.cpu.totalWorkTime / coreRuns).toFixed(2),
                rendered = this.video.frames - this.video.skipped,
                avgGpu = rendered > 0 ? (this.video.gpuTime / rendered).toFixed(2) : "0.00",
                renderPct = (this.video.frames > 0) ? (rendered * 100 / this.video.frames) | 0 : 0,
                avgBacklog = this.samples.backlogCount > 0 ? (this.samples.backlog / this.samples.backlogCount) | 0 : 0,
                div = (typeof Module !== 'undefined' && Module.isNDS) ? (coreRuns / 2) : coreRuns;
            console.log(`[${scriptName.toUpperCase()}] Speed:${speedPct}% CPU:${avgCpu}ms GPU:${avgGpu}ms Render:${renderPct}% Audio:${(this.samples.count / div) | 0} Backlog:${avgBacklog}`);
        }
        this.reset();
    }
};