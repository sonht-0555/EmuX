#include <string.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE int retro_is_dirty(const void *buf1, const void *buf2, size_t size) {
    return memcmp(buf1, buf2, size) != 0;
}
