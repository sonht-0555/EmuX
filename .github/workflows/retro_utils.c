#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <emscripten.h>

// Bổ sung hàm thiếu cho các Core như Gambatte
void fill_pathname_join(char *out, const char *dir, const char *path, size_t size) {
    if (out != dir) {
        strncpy(out, dir, size);
    }
    
    size_t len = strlen(out);
    if (len > 0 && out[len-1] != '/' && out[len-1] != '\\' && len < size - 1) {
        strcat(out, "/");
    }
    
    strncat(out, path, size - strlen(out) - 1);
}

// Bổ sung hàm base name
void fill_pathname_base(char *out, const char *path, size_t size) {
    const char *slash = strrchr(path, '/');
    if (!slash) slash = strrchr(path, '\\');
    if (slash) {
        strncpy(out, slash + 1, size);
    } else {
        strncpy(out, path, size);
    }
}

// Stub cho mkdir
bool path_mkdir(const char *dir) {
    return true;
}

bool path_contains_rom_file(const char *path) {
    return true;
}

// Bổ sung hàm dir name
void fill_pathname_dir(char *out, const char *path, size_t size) {
    const char *slash = strrchr(path, '/');
    if (!slash) slash = strrchr(path, '\\');
    if (slash) {
        size_t len = slash - path;
        if (len >= size) len = size - 1;
        strncpy(out, path, len);
        out[len] = '\0';
    } else {
        out[0] = '\0';
    }
}

// Stub kiểm tra đường dẫn tuyệt đối
bool path_is_absolute(const char *path) {
    return (path && path[0] == '/');
}

// Bổ sung các hàm phổ biến khác để tránh build đi build lại
void fill_pathname_extension(char *out, const char *path, size_t size) {
    const char *ext = strrchr(path, '.');
    if (ext) strncpy(out, ext + 1, size);
    else out[0] = '\0';
}

void fill_pathname_noext(char *out, const char *path, size_t size) {
    strncpy(out, path, size);
    char *dot = strrchr(out, '.');
    if (dot) *dot = '\0';
}

const char* path_get_extension(const char *path) {
    const char *dot = strrchr(path, '.');
    return dot ? dot + 1 : "";
}

bool string_is_empty(const char *data) {
    return (!data || (*data == '\0'));
}

bool string_is_equal(const char *a, const char *b) {
    if (!a || !b) return false;
    return strcmp(a, b) == 0;
}

bool path_is_directory(const char *path) {
    return false;
}

// Cài đặt nhanh strlcpy nếu thiếu
size_t strlcpy(char *dest, const char *src, size_t size) {
    size_t i;
    for (i = 0; i < size - 1 && src[i] != '\0'; i++) dest[i] = src[i];
    if (size > 0) dest[i] = '\0';
    while (src[i] != '\0') i++;
    return i;
}

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

// ===== Audio Resampler (Lightweight & Fast) =====
#define AUDIO_RING_SIZE 16384
#define AUDIO_RING_MASK (AUDIO_RING_SIZE - 1)

static float audio_ring_l[AUDIO_RING_SIZE];
static float audio_ring_r[AUDIO_RING_SIZE];
static int audio_write_pos = 0;
static float audio_read_pos = 0.0f;

EMSCRIPTEN_KEEPALIVE void emux_audio_reset() {
    audio_write_pos = 0;
    audio_read_pos = 0.0f;
    memset(audio_ring_l, 0, sizeof(audio_ring_l));
    memset(audio_ring_r, 0, sizeof(audio_ring_r));
}

EMSCRIPTEN_KEEPALIVE int emux_audio_process(const int16_t *src, int frames, float *dst_l, float *dst_r, float ratio) {
    const float inv = 1.0f / 32768.0f;
    
    // 1. Ghi cực nhanh vào ring buffer
    for (int i = 0; i < frames; i++) {
        audio_ring_l[audio_write_pos] = src[i * 2] * inv;
        audio_ring_r[audio_write_pos] = src[i * 2 + 1] * inv;
        audio_write_pos = (audio_write_pos + 1) & AUDIO_RING_MASK;
    }

    int out_count = 0;
    int write_snapshot = audio_write_pos;
    float p = audio_read_pos;

    // 2. Nội suy tuyến tính (Linear) - Rẻ nhất và mát CPU nhất
    // Chỉ cần 2 điểm: p1 và p2. Yêu cầu avail >= 2
    int avail = (write_snapshot - (int)p + AUDIO_RING_SIZE) & AUDIO_RING_MASK;
    while (avail >= 2) {
        int i = (int)p;
        float f = p - i;
        int next = (i + 1) & AUDIO_RING_MASK;
        
        // Công thức nội suy tuyến tính: p1 + f * (p2 - p1)
        dst_l[out_count] = audio_ring_l[i] + f * (audio_ring_l[next] - audio_ring_l[i]);
        dst_r[out_count] = audio_ring_r[i] + f * (audio_ring_r[next] - audio_ring_r[i]);
        
        out_count++;
        p += ratio;
        if (p >= (float)AUDIO_RING_SIZE) p -= (float)AUDIO_RING_SIZE;
        avail = (write_snapshot - (int)p + AUDIO_RING_SIZE) & AUDIO_RING_MASK;
    }

    audio_read_pos = p;
    return out_count;
}
