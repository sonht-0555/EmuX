#define _FILE_OFFSET_BITS 64
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <zlib.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define WEAK __attribute__((weak))

static uint8_t  *g_buf  = NULL;
static uint32_t  g_size = 0;

struct memstream {
  uint8_t  *buf;
  uint32_t  size;
  uint32_t  pos;
  int       writing;
};

/* --- Memstream API Standard (ABI Compatible) --- */

WEAK void memstream_set_buffer(uint8_t *buf, uint64_t size) {
  g_buf  = buf;
  g_size = (uint32_t)size;
}

WEAK void *memstream_open(int writing) {
  struct memstream *m = (struct memstream *)calloc(1, sizeof(*m));
  if (!m) return NULL;
  m->buf     = g_buf;
  m->size    = g_size;
  m->pos     = 0;
  m->writing = writing;
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
  uint32_t to_read = (uint32_t)len;
  if (m->pos + to_read > m->size) to_read = m->size - m->pos;
  memcpy(data, m->buf + m->pos, to_read);
  m->pos += to_read;
  return (uint64_t)to_read;
}

WEAK uint64_t memstream_write(void *stream, const void *data, uint64_t len) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || !m->writing || m->pos >= m->size) return 0;
  uint32_t to_write = (uint32_t)len;
  if (m->pos + to_write > m->size) to_write = m->size - m->pos;
  memcpy(m->buf + m->pos, data, to_write);
  m->pos += to_write;
  return (uint64_t)to_write;
}

WEAK int memstream_putc(void *stream, int c) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || !m->writing || m->pos >= m->size) return EOF;
  m->buf[m->pos++] = (uint8_t)c;
  return c;
}

WEAK int memstream_getc(void *stream) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || m->pos >= m->size) return EOF;
  return m->buf[m->pos++];
}

WEAK int64_t memstream_seek(void *stream, int64_t offset, int whence) {
  struct memstream *m = (struct memstream *)stream;
  if (!m) return -1;
  uint32_t new_pos = m->pos;
  if (whence == SEEK_SET)      new_pos = (uint32_t)offset;
  else if (whence == SEEK_CUR) new_pos += (uint32_t)offset;
  else if (whence == SEEK_END) new_pos = m->size + (uint32_t)offset;
  if (new_pos > m->size) return -1;
  m->pos = new_pos;
  return 0; // Success
}

WEAK int64_t memstream_tell(void *stream) {
  struct memstream *m = (struct memstream *)stream;
  return m ? (int64_t)m->pos : -1;
}

WEAK uint64_t memstream_pos(void *stream) {
  struct memstream *m = (struct memstream *)stream;
  return m ? (uint64_t)m->pos : 0;
}

WEAK uint8_t *memstream_get_ptr(void *stream, size_t *size) {
  struct memstream *m = (struct memstream *)stream;
  if (!m) return NULL;
  if (size) *size = (size_t)m->size;
  return m->buf;
}

/* --- Base Fallbacks --- */
WEAK bool path_is_valid(const char *path) { return (path && *path); }
WEAK void filestream_vfs_init(void) { }
WEAK void *filestream_open(const char *path, unsigned mode, unsigned hints) {
  return (void *)fopen(path, (mode & 2) ? "wb" : "rb");
}
WEAK int64_t filestream_read(void *stream, void *data, int64_t len) { return (int64_t)fread(data, 1, (size_t)len, (FILE *)stream); }
WEAK int64_t filestream_close(void *stream) { return (int64_t)fclose((FILE *)stream); }
WEAK uint32_t encoding_crc32(uint32_t crc, const uint8_t *data, size_t len) {
  return (uint32_t)crc32((unsigned long)crc, (const unsigned char *)data, (unsigned int)len);
}
