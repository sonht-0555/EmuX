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

/* Static storage for legacy memstream (PokeMini 2-arg style) */
static uint8_t  *g_memstream_buf  = NULL;
static uint64_t  g_memstream_size = 0;

struct memstream {
  uint8_t  *buf;
  uint64_t  size;
  uint64_t  pos;
  bool      writable;
};

/* PokeMini calls memstream_set_buffer(buf, size) — 2 args, global buffer */
WEAK void memstream_set_buffer(uint8_t *buf, uint64_t size) {
  g_memstream_buf  = buf;
  g_memstream_size = size;
}

WEAK void *memstream_open(int writable) {
  struct memstream *m = (struct memstream *)calloc(1, sizeof(*m));
  if (!m) return NULL;
  m->buf      = g_memstream_buf;
  m->size     = g_memstream_size;
  m->pos      = 0;
  m->writable = (bool)writable;
  return m;
}

WEAK void memstream_close(void *stream) {
  if (stream) free(stream);
}

WEAK void memstream_rewind(void *stream) {
  struct memstream *m = (struct memstream *)stream;
  if (m) m->pos = 0;
}

WEAK uint64_t memstream_read(void *stream, void *data, uint64_t len) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(data, m->buf + m->pos, (size_t)len);
  m->pos += len;
  return len;
}

WEAK uint64_t memstream_write(void *stream, const void *data, uint64_t len) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || !m->writable || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(m->buf + m->pos, data, (size_t)len);
  m->pos += len;
  return len;
}

WEAK int64_t memstream_seek(void *stream, int64_t offset, int whence) {
  struct memstream *m = (struct memstream *)stream;
  if (!m) return -1;
  uint64_t new_pos = m->pos;
  if (whence == SEEK_SET) new_pos = (uint64_t)offset;
  else if (whence == SEEK_CUR) new_pos += offset;
  else if (whence == SEEK_END) new_pos = m->size + offset;
  if (new_pos > m->size) return -1;
  m->pos = new_pos;
  return (int64_t)m->pos;
}

WEAK int64_t memstream_tell(void *stream) {
  return stream ? (int64_t)((struct memstream *)stream)->pos : -1;
}

WEAK uint64_t memstream_pos(void *stream) {
  return stream ? ((struct memstream *)stream)->pos : 0;
}

WEAK uint8_t *memstream_get_ptr(void *stream, size_t *size) {
  struct memstream *m = (struct memstream *)stream;
  if (!m) return NULL;
  if (size) *size = (size_t)m->size;
  return m->buf;
}

/* --- Base Fallbacks for PokeMini Linkage --- */
WEAK bool path_is_valid(const char *path) { return (path && *path); }
WEAK void filestream_vfs_init(void) { }
WEAK void *filestream_open(const char *path, unsigned mode, unsigned hints) {
  return (void *)fopen(path, (mode & 2) ? "wb" : "rb");
}
WEAK int64_t filestream_read(void *stream, void *data, int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, (FILE *)stream);
}
WEAK int64_t filestream_close(void *stream) {
  return (int64_t)fclose((FILE *)stream);
}
WEAK uint32_t encoding_crc32(uint32_t crc, const uint8_t *data, size_t len) {
  return (uint32_t)crc32((unsigned long)crc, (const unsigned char *)data, (unsigned int)len);
}
