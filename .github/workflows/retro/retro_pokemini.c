#define _FILE_OFFSET_BITS 64
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#define WEAK __attribute__((weak))
#define W    WEAK EMSCRIPTEN_KEEPALIVE
/* ── Memstream globals ── */
static uint8_t  *g_buf  = NULL;
static uint32_t  g_size = 0;
struct memstream { uint8_t *buf; uint32_t size, pos; int writing; };
#define M ((struct memstream *)stream)
/* ── Memstream API ── */
W void memstream_set_buffer(uint8_t *buf, uint64_t size) { g_buf = buf; g_size = (uint32_t)size; }
W void *memstream_open(int writing) {
  struct memstream *m = calloc(1, sizeof(*m));
  if (!m) return NULL;
  m->buf = g_buf; m->size = g_size; m->writing = writing;
  return m;
}
W void     memstream_close (void *stream)  { if (stream) free(stream); }
W void     memstream_rewind(void *stream)  { if (M) M->pos = 0; }
W int64_t  memstream_tell  (void *stream)  { return M ? (int64_t)M->pos : -1; }
W uint64_t memstream_pos   (void *stream)  { return M ? (uint64_t)M->pos : 0; }
W uint64_t memstream_read(void *stream, void *data, uint64_t len) {
  if (!M || !M->buf || M->pos >= M->size) return 0;
  uint32_t n = (uint32_t)len;
  if (M->pos + n > M->size) n = M->size - M->pos;
  memcpy(data, M->buf + M->pos, n);
  M->pos += n;
  return n;
}
W uint64_t memstream_write(void *stream, const void *data, uint64_t len) {
  if (!M || !M->buf || !M->writing || M->pos >= M->size) return 0;
  uint32_t n = (uint32_t)len;
  if (M->pos + n > M->size) n = M->size - M->pos;
  memcpy(M->buf + M->pos, data, n);
  M->pos += n;
  return n;
}
W int memstream_putc(void *stream, int c) {
  if (!M || !M->buf || !M->writing || M->pos >= M->size) return EOF;
  M->buf[M->pos++] = (uint8_t)c;
  return c;
}
W int memstream_getc(void *stream) {
  if (!M || !M->buf || M->pos >= M->size) return EOF;
  return M->buf[M->pos++];
}
W int64_t memstream_seek(void *stream, int64_t offset, int whence) {
  if (!M) return -1;
  uint32_t np = M->pos;
  if      (whence == SEEK_SET) np = (uint32_t)offset;
  else if (whence == SEEK_CUR) np += (uint32_t)offset;
  else if (whence == SEEK_END) np = M->size + (uint32_t)offset;
  if (np > M->size) return -1;
  M->pos = np;
  return 0;
}
W uint8_t *memstream_get_ptr(void *stream, size_t *size) {
  if (!M) return NULL;
  if (size) *size = (size_t)M->size;
  return M->buf;
}
#undef M
/* ── Base Fallbacks ── */
W bool     path_is_valid    (const char *p)                              { return p && *p; }
W void     filestream_vfs_init(void)                                     { }
W void    *filestream_open  (const char *p, unsigned m, unsigned h)      { return fopen(p, (m & 2) ? "wb" : "rb"); }
W int64_t  filestream_read  (void *s, void *d, int64_t n)               { return (int64_t)fread(d, 1, (size_t)n, s); }
W int64_t  filestream_close (void *s)                                    { return s ? (int64_t)fclose(s) : -1; }
W uint32_t encoding_crc32   (uint32_t crc, const uint8_t *d, size_t n)  { return (uint32_t)crc32((unsigned long)crc, d, (unsigned int)n); }
