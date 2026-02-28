#define _FILE_OFFSET_BITS 64
#include <dirent.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <zlib.h>

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define WEAK __attribute__((weak))

/* Startup Verification */
__attribute__((constructor))
void glue_startup_check() {
  EM_ASM({ console.log("--- [C-Glue] Super Trace Initialized ---"); });
}

/* Memstream - 32bit Safe signatures */
struct memstream {
  uint8_t *buf;
  size_t size;
  size_t pos;
  bool writable;
};

WEAK void *memstream_open(bool writable) {
  EM_ASM({ console.log("[C-Trace] memstream_open writable:", $0); }, writable);
  struct memstream *m = (struct memstream *)calloc(1, sizeof(*m));
  m->writable = writable;
  return m;
}

WEAK void memstream_close(void *stream) {
  EM_ASM({ console.log("[C-Trace] memstream_close"); });
  free(stream);
}

WEAK void memstream_set_buffer(void *stream, uint8_t *buf, size_t size) {
  EM_ASM({ console.log("[C-Trace] memstream_set_buffer ptr:", $0, "size:", (int)$1); }, buf, size);
  struct memstream *m = (struct memstream *)stream;
  if (!m) return;
  m->buf = buf;
  m->size = size;
  m->pos = 0;
}

WEAK int32_t memstream_read(void *stream, void *data, size_t len) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(data, m->buf + m->pos, len);
  m->pos += len;
  return (int32_t)len;
}

WEAK int32_t memstream_write(void *stream, const void *data, size_t len) {
  EM_ASM({ console.log("[C-Trace] memstream_write len:", $0, "pos:", $1); }, (int)len, (int)(stream ? ((struct memstream *)stream)->pos : 0));
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || !m->writable || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(m->buf + m->pos, data, len);
  m->pos += len;
  return (int32_t)len;
}

WEAK int32_t memstream_seek(void *stream, int32_t offset, int whence) {
  EM_ASM({ console.log("[C-Trace] memstream_seek offset:", $0, "whence:", $1); }, offset, whence);
  struct memstream *m = (struct memstream *)stream;
  if (!m) return -1;
  size_t new_pos = m->pos;
  switch (whence) {
    case SEEK_SET: new_pos = (size_t)offset; break;
    case SEEK_CUR: new_pos += (size_t)offset; break;
    case SEEK_END: new_pos = m->size + (size_t)offset; break;
  }
  if (new_pos > m->size) return -1;
  m->pos = new_pos;
  return (int32_t)m->pos;
}

WEAK int32_t memstream_tell(void *stream) {
  return stream ? (int32_t)((struct memstream *)stream)->pos : -1;
}

WEAK uint32_t memstream_pos(void *stream) {
  return stream ? (uint32_t)((struct memstream *)stream)->pos : 0;
}

/* VFS Handlers */
static const char *vfs_mode_to_string(unsigned mode) {
  if (mode & (1 << 2)) return "r+b";
  if ((mode & 3) == 3) return "w+b";
  if (mode & 2) return "wb";
  return "rb";
}

struct retro_vfs_file_handle { FILE *fp; };

WEAK struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  EM_ASM({ console.log("[C-Trace] VFS Open path:", UTF8ToString($0)); }, path);
  FILE *fp = fopen(path, vfs_mode_to_string(mode));
  if (!fp) return NULL;
  struct retro_vfs_file_handle *handle = malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

WEAK int retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (stream) { fclose(stream->fp); free(stream); }
  return 0;
}

WEAK int32_t retro_vfs_file_read_impl(struct retro_vfs_file_handle *stream, void *data, int32_t len) {
  return (int32_t)fread(data, 1, (size_t)len, stream->fp);
}

WEAK int32_t retro_vfs_file_write_impl(struct retro_vfs_file_handle *stream, const void *data, int32_t len) {
  return (int32_t)fwrite(data, 1, (size_t)len, stream->fp);
}

WEAK int32_t retro_vfs_file_seek_impl(struct retro_vfs_file_handle *stream, int32_t offset, int seek_position) {
  if (fseek(stream->fp, (long)offset, seek_position) == 0)
    return (int32_t)ftell(stream->fp);
  return -1;
}

WEAK int32_t retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return (int32_t)ftell(stream->fp);
}

WEAK int32_t retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *stream) {
  if (!stream || !stream->fp) return 0;
  long curr = ftell(stream->fp);
  fseek(stream->fp, 0, SEEK_END);
  long size = ftell(stream->fp);
  fseek(stream->fp, curr, SEEK_SET);
  return (int32_t)size;
}

/* Fallbacks for older cores */
WEAK uint32_t encoding_crc32(uint32_t crc, const uint8_t *data, size_t len) {
  return (uint32_t)crc32((unsigned long)crc, (const unsigned char *)data, (unsigned int)len);
}
