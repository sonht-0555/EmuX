#include <string.h>
#include <stdint.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE int retro_is_dirty(const void *buf1, void *buf2, size_t size) {
    if (memcmp(buf1, buf2, size) == 0) return 0;
    memcpy(buf2, buf1, size);
    return 1;
}

EMSCRIPTEN_KEEPALIVE int retro_render16(const uint16_t *src, uint16_t *cache, uint32_t *dst, int width, int height, int stride, const uint32_t *lut) {
    size_t size = (stride << 1) * height;
    if (memcmp(src, cache, size) == 0) return 0;
    memcpy(cache, src, size);
    
    for (int y = 0; y < height; y++) {
        const uint16_t *s = src + y * stride;
        uint32_t *d = dst + y * width;
        for (int x = 0; x < width; x++) {
            d[x] = lut[s[x]];
        }
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE int retro_render32(const uint32_t *src, uint32_t *cache, uint32_t *dst, int length) {
    if (memcmp(src, cache, length << 2) == 0) return 0;
    memcpy(cache, src, length << 2);
    
    for (int i = 0; i < length; i++) {
        uint32_t color = src[i];
        dst[i] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | ((color >> 16) & 0xFF);
    }
    return 1;
}
