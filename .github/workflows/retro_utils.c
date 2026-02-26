#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <emscripten.h>

// ===== Video Utilities (Không đổi) =====
EMSCRIPTEN_KEEPALIVE int emux_is_dirty(const uint32_t * restrict buf1, uint32_t * restrict buf2, size_t size) {
    size_t len = size >> 2;
    size_t step = len >> 8;
    if (step) {
        const uint32_t *p1 = buf1, *p2 = buf2;
        for (int i = 0; i < 256; i++, p1 += step, p2 += step) {
            if (*p1 != *p2) goto dirty;
        }
    }
    if (memcmp(buf1, buf2, size) == 0) return 0;
dirty:
    memcpy(buf2, buf1, size);
    return 1;
}

EMSCRIPTEN_KEEPALIVE int emux_render16(const uint16_t * restrict src, uint16_t * restrict cache, uint32_t * restrict dst, int width, int height, int stride, const uint32_t * restrict lut) {
    size_t total_px = stride * height;
    size_t step = total_px >> 8;
    if (step) {
        const uint16_t *p1 = src, *p2 = cache;
        for (int i = 0; i < 256; i++, p1 += step, p2 += step) {
            if (*p1 != *p2) goto dirty16;
        }
    }
    if (memcmp(src, cache, total_px << 1) == 0) return 0;
dirty16:
    memcpy(cache, src, total_px << 1);
    for (int y = 0; y < height; y++) {
        const uint16_t *s = cache + y * stride;
        uint32_t *d = dst + y * width;
        for (int x = 0; x < width; x++) {
            d[x] = lut[s[x]];
        }
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE int emux_render32(const uint32_t * restrict src, uint32_t * restrict cache, uint32_t * restrict dst, int length) {
    size_t step = length >> 8;
    if (step) {
        const uint32_t *p1 = src, *p2 = cache;
        for (int i = 0; i < 256; i++, p1 += step, p2 += step) {
            if (*p1 != *p2) goto dirty32;
        }
    }
    if (memcmp(src, cache, length << 2) == 0) return 0;
dirty32:
    memcpy(cache, src, length << 2);
    for (int i = 0; i < length; i++) {
        uint32_t c = cache[i];
        dst[i] = 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16 & 0xFF);
    }
    return 1;
}

// ===== Audio Engine (Truyền thống + Tối ưu) =====
#define AUDIO_OUT_MAX 4096

static float audio_out_l[AUDIO_OUT_MAX];
static float audio_out_r[AUDIO_OUT_MAX];

static float audio_ratio = 1.0f;
static float audio_frac = 0.0f;
static float prev_l = 0.0f;
static float prev_r = 0.0f;

EMSCRIPTEN_KEEPALIVE float* emux_audio_get_buffer_l() { return audio_out_l; }
EMSCRIPTEN_KEEPALIVE float* emux_audio_get_buffer_r() { return audio_out_r; }

EMSCRIPTEN_KEEPALIVE void emux_audio_set_core_rate(float core_rate) {
    audio_ratio = core_rate / 48000.0f;
}

EMSCRIPTEN_KEEPALIVE void emux_audio_reset() {
    audio_frac = 0.0f;
    prev_l = 0.0f;
    prev_r = 0.0f;
}

EMSCRIPTEN_KEEPALIVE int emux_audio_process(const int16_t *src, int frames) {
    if (frames <= 0) return 0;

    const float inv = 1.0f / 32768.0f;
    int out_count = 0;

    for (int i = 0; i < frames; i++) {
        float cur_l = src[i * 2] * inv;
        float cur_r = src[i * 2 + 1] * inv;

        while (audio_frac < 1.0f) {
            if (out_count >= AUDIO_OUT_MAX) goto done;

            float t = audio_frac;
            audio_out_l[out_count] = prev_l + t * (cur_l - prev_l);
            audio_out_r[out_count] = prev_r + t * (cur_r - prev_r);
            out_count++;
            audio_frac += audio_ratio;
        }
        audio_frac -= 1.0f;
        prev_l = cur_l;
        prev_r = cur_r;
    }

done:
    return out_count;
}
