// ===== EmuX Performance Tool =====
window.Perf = {
    enabled: false,
    samples: { count: 0, min: 9999, max: 0, batches: 0 },
    video: { frames: 0, skipped: 0 },
    cpu: { totalWorkTime: 0, lastFrameStart: 0 },
    lastReportTime: performance.now(),
    toggle() {
        this.enabled = !this.enabled;
        this.reset();
    },
    countAudio(f) {
        if (!this.enabled) return;
        this.samples.count += f;
        this.samples.batches++;
        if (f < this.samples.min) this.samples.min = f;
        if (f > this.samples.max) this.samples.max = f;
    },
    beginCore() { if (this.enabled) this.cpu.lastFrameStart = performance.now(); },
    endCore() { if (this.enabled) this.cpu.totalWorkTime += (performance.now() - this.cpu.lastFrameStart); },
    report(scriptName, coreRuns) {
        const now = performance.now();
        const elapsed = now - this.lastReportTime;
        const speedPct = Math.min(100, (1000 / elapsed) * 100) | 0;
        if (this.enabled) {
            const avgCpuMs = (this.cpu.totalWorkTime / coreRuns).toFixed(2);
            const rendered = this.video.frames - this.video.skipped;
            const renderPct = (this.video.frames > 0) ? (rendered * 100 / this.video.frames) | 0 : 0;
            const div = (typeof Module !== 'undefined' && Module.isNDS) ? (coreRuns / 2) : coreRuns;
            const avgAudio = (this.samples.count / div) | 0;
            console.log(`[${scriptName.toUpperCase()}] Speed:${speedPct}% CPU:${avgCpuMs}ms Render:${renderPct}% Audio:${avgAudio}`);
        }
        this.lastReportTime = now;
        this.reset();
    },
    reset() {
        this.samples = { count: 0, min: 9999, max: 0, batches: 0 };
        this.video = { frames: 0, skipped: 0 };
        this.cpu.totalWorkTime = 0;
    }
};
console.log("Perf.toggle() to enable/disable logging.");