#include <string.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE int retro_is_dirty(const void *buf1, void *buf2, size_t size) {
    if (memcmp(buf1, buf2, size) == 0) return 0;
    memcpy(buf2, buf1, size);
    return 1;
}
