#include <string.h>
#include <stdint.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE int retro_is_dirty(const uint32_t * restrict buf1, uint32_t * restrict buf2, size_t size) {
    size_t len = size >> 2;
    size_t step = len >> 8;
    if (step) {
        for (int i = 0; i < 256; i++) {
            if (buf1[i * step] != buf2[i * step]) goto dirty;
        }
    }
    if (memcmp(buf1, buf2, size) == 0) return 0;
dirty:
    memcpy(buf2, buf1, size);
    return 1;
}

EMSCRIPTEN_KEEPALIVE int retro_render16(const uint16_t * restrict src, uint16_t * restrict cache, uint32_t * restrict dst, int width, int height, int stride, const uint32_t * restrict lut) {
    size_t total_px = stride * height;
    size_t step = total_px >> 8;
    if (step) {
        for (int i = 0; i < 256; i++) {
            if (src[i * step] != cache[i * step]) goto dirty16;
        }
    }
    if (memcmp(src, cache, total_px << 1) == 0) return 0;
dirty16:
    memcpy(cache, src, total_px << 1);
    for (int y = 0; y < height; y++) {
        const uint16_t *s = src + y * stride;
        uint32_t *d = dst + y * width;
        for (int x = 0; x < width; x++) {
            d[x] = lut[s[x]];
        }
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE int retro_render32(const uint32_t * restrict src, uint32_t * restrict cache, uint32_t * restrict dst, int length) {
    size_t step = length >> 8;
    if (step) {
        for (int i = 0; i < 256; i++) {
            if (src[i * step] != cache[i * step]) goto dirty32;
        }
    }
    if (memcmp(src, cache, length << 2) == 0) return 0;
dirty32:
    memcpy(cache, src, length << 2);
    for (int i = 0; i < length; i++) {
        uint32_t color = src[i];
        dst[i] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | ((color >> 16) & 0xFF);
    }
    return 1;
}
