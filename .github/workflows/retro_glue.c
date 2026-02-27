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

/* Fix for IDE/IntelliSense red squiggly lines */
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

/* Weak attribute to avoid "multiple definition" errors when linking with cores that already have these functions */
#define WEAK __attribute__((weak))

/* CRC32 Utility */
WEAK uint32_t encoding_crc32(uint32_t crc, const uint8_t *data, size_t len) {
  return (uint32_t)crc32((unsigned long)crc, (const unsigned char *)data, (unsigned int)len);
}

WEAK char *string_trim_whitespace_right(char *str) {
  if (!str) return NULL;
  char *end = str + strlen(str) - 1;
  while (end >= str && (*end == ' ' || *end == '\t' || *end == '\n' || *end == '\r')) {
    *end = '\0';
    end--;
  }
  return str;
}

WEAK size_t strlcpy_retro__(char *dest, const char *src, size_t size) {
  size_t i;
  if (!size) return strlen(src);
  for (i = 0; i < size - 1 && src[i] != '\0'; i++) dest[i] = src[i];
  dest[i] = '\0';
  return strlen(src);
}

WEAK size_t strlcat_retro__(char *dest, const char *src, size_t size) {
  size_t dest_len = strlen(dest);
  size_t src_len = strlen(src);
  size_t i;

  if (dest_len >= size) return size + src_len;

  for (i = 0; i < size - dest_len - 1 && src[i] != '\0'; i++) {
    dest[dest_len + i] = src[i];
  }
  dest[dest_len + i] = '\0';
  return dest_len + src_len;
}

/* Libretro VFS Constants */
#define RETRO_VFS_FILE_ACCESS_READ (1 << 0)
#define RETRO_VFS_FILE_ACCESS_WRITE (1 << 1)
#define RETRO_VFS_FILE_ACCESS_READ_WRITE                                       \
  (RETRO_VFS_FILE_ACCESS_READ | RETRO_VFS_FILE_ACCESS_WRITE)
#define RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING (1 << 2)

#define RETRO_VFS_FILE_ACCESS_HINT_NONE (0)
#define RETRO_VFS_FILE_ACCESS_HINT_FREQUENT_ACCESS (1 << 0)

/* String utilities - Kept for core logic compatibility */
WEAK char *string_to_lower(const char *str) {
  if (!str)
    return NULL;
  char *lower = strdup(str);
  for (int i = 0; lower[i]; i++)
    if (lower[i] >= 'A' && lower[i] <= 'Z')
      lower[i] += 32;
  return lower;
}

WEAK char *
string_replace_substring(const char *in, size_t in_len, const char *pattern,
                         size_t pattern_len, const char *replacement,
                         size_t replacement_len) {
  size_t outlen;
  size_t numhits = 0;
  const char *inat = NULL;
  const char *inprev = NULL;
  char *out = NULL;
  char *outat = NULL;

  if (!pattern || !replacement)
    return strdup(in);

  inat = in;
  while ((inat = strstr(inat, pattern))) {
    inat += pattern_len;
    numhits++;
  }

  outlen = in_len - pattern_len * numhits + replacement_len * numhits;
  if (!(out = (char *)malloc(outlen + 1)))
    return NULL;

  outat = out;
  inat = in;
  inprev = in;

  while ((inat = strstr(inat, pattern))) {
    memcpy(outat, inprev, inat - inprev);
    outat += inat - inprev;
    memcpy(outat, replacement, replacement_len);
    outat += replacement_len;
    inat += pattern_len;
    inprev = inat;
  }
  strcpy(outat, inprev);
  return out;
}

/* Path utilities */
WEAK const char *find_last_slash(const char *str) {
  const char *s1 = strrchr(str, '/'), *s2 = strrchr(str, '\\');
  return (s1 > s2) ? s1 : (s2 ? s2 : s1);
}

WEAK const char *path_basename(const char *path) {
  const char *last = find_last_slash(path);
  return last ? last + 1 : path;
}

WEAK void path_parent_dir(char *path) {
  char *last = (char *)find_last_slash(path);
  if (last)
    *last = '\0';
  else
    *path = '\0';
}

WEAK bool path_is_absolute(const char *path) {
  return (path && (path[0] == '/' ||
                   (strlen(path) > 2 && path[1] == ':' && path[2] == '\\')));
}

WEAK void path_remove_extension(char *path) {
  char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  if (dot && (!slash || dot > slash))
    *dot = '\0';
}

WEAK bool path_is_valid(const char *path) {
  return (path && *path);
}

WEAK void fill_pathname_join(char *out, const char *dir, const char *path, size_t size) {
  if (out != dir) strlcpy_retro__(out, dir, size);
  
  if (*out) {
    char last = out[strlen(out) - 1];
    if (last != '/' && last != '\\') strlcat_retro__(out, "/", size);
  }
  
  strlcat_retro__(out, path, size);
}

WEAK void fill_pathname_resolve_relative(char *out, const char *dir, const char *path, size_t size) {
  if (path_is_absolute(path)) {
    strlcpy_retro__(out, path, size);
  } else {
    fill_pathname_join(out, dir, path, size);
  }
}

WEAK const char *path_get_extension(const char *path) {
  const char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  return (dot && (!slash || dot > slash)) ? dot + 1 : "";
}

WEAK bool path_mkdir(const char *dir) {
  return mkdir(dir, 0777) == 0;
}

WEAK bool path_is_directory(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0 && S_ISDIR(st.st_mode));
}

/* Directory utilities */
struct RDIR {
  DIR *d;
  struct dirent *e;
};

WEAK struct RDIR *
retro_opendir_include_hidden(const char *name, bool include_hidden) {
  DIR *d = opendir(name);
  if (!d)
    return NULL;
  struct RDIR *r = malloc(sizeof(struct RDIR));
  r->d = d;
  r->e = NULL;
  return r;
}

WEAK bool retro_readdir(struct RDIR *r) {
  return r && (r->e = readdir(r->d)) != NULL;
}

WEAK const char *retro_dirent_get_name(struct RDIR *r) {
  return r && r->e ? r->e->d_name : NULL;
}

WEAK bool retro_dirent_is_dir(struct RDIR *r,
                                               const char *path) {
  if (!r || !r->e)
    return false;
  if (r->e->d_type == DT_DIR)
    return true;
  char fp[1024];
  snprintf(fp, 1024, "%s/%s", path, r->e->d_name);
  struct stat st;
  return (stat(fp, &st) == 0 && S_ISDIR(st.st_mode));
}

WEAK int retro_dirent_error(struct RDIR *r) {
  return 0;
}

WEAK void retro_closedir(struct RDIR *r) {
  if (r) {
    closedir(r->d);
    free(r);
  }
}

/* File I/O utilities */
static const char *vfs_mode_to_string(unsigned mode) {
  if (mode & (RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING)) return "r+b";
  if ((mode & RETRO_VFS_FILE_ACCESS_READ_WRITE) == RETRO_VFS_FILE_ACCESS_READ_WRITE) return "w+b";
  if (mode & RETRO_VFS_FILE_ACCESS_WRITE) return "wb";
  return "rb";
}

WEAK void *filestream_open(const char *path, unsigned mode,
                                           unsigned hints) {
  return (void *)fopen(path, vfs_mode_to_string(mode));
}

WEAK int64_t filestream_read(void *stream, void *data,
                                              int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, (FILE *)stream);
}

WEAK int64_t filestream_write(void *stream, const void *data,
                                               int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, (FILE *)stream);
}

WEAK char *filestream_gets(void *stream, char *s, size_t len) {
  return fgets(s, (int)len, (FILE *)stream);
}

WEAK int filestream_eof(void *stream) {
  return feof((FILE *)stream);
}

WEAK int filestream_getc(void *stream) {
  return fgetc((FILE *)stream);
}

WEAK int filestream_error(void *stream) {
  return ferror((FILE *)stream);
}

WEAK void filestream_vfs_init(void) { }
WEAK void dirent_vfs_init(void) { }
WEAK void path_vfs_init(void) { }

/* Memstream utilities for cores like Pokemon Mini */
struct memstream {
  uint8_t *buf;
  size_t size;
  size_t pos;
  bool writable;
};

WEAK void *memstream_open(bool writable) {
  printf("[C-Debug] memstream_open writable:%d\n", writable);
  struct memstream *m = (struct memstream *)calloc(1, sizeof(*m));
  m->writable = writable;
  return m;
}

WEAK void memstream_close(void *stream) {
  printf("[C-Debug] memstream_close\n");
  free(stream);
}

WEAK void memstream_set_buffer(void *stream, uint8_t *buf, size_t size) {
  printf("[C-Debug] memstream_set_buffer ptr:%p size:%zu\n", buf, size);
  struct memstream *m = (struct memstream *)stream;
  if (!m) return;
  m->buf = buf;
  m->size = size;
  m->pos = 0;
}

WEAK int64_t memstream_read(void *stream, void *data, int64_t len) {
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(data, m->buf + m->pos, (size_t)len);
  m->pos += (size_t)len;
  return len;
}

WEAK int64_t memstream_write(void *stream, const void *data, int64_t len) {
  printf("[C-Debug] memstream_write len:%lld pos:%zu\n", (long long)len, stream ? ((struct memstream *)stream)->pos : 0);
  struct memstream *m = (struct memstream *)stream;
  if (!m || !m->buf || !m->writable || m->pos >= m->size) return 0;
  if (m->pos + len > m->size) len = m->size - m->pos;
  memcpy(m->buf + m->pos, data, (size_t)len);
  m->pos += (size_t)len;
  return len;
}

WEAK int64_t memstream_seek(void *stream, int64_t offset, int whence) {
  printf("[C-Debug] memstream_seek offset:%lld whence:%d\n", (long long)offset, whence);
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
  return (int64_t)m->pos;
}

WEAK int64_t memstream_tell(void *stream) {
  return stream ? (int64_t)((struct memstream *)stream)->pos : -1;
}

WEAK uint64_t memstream_pos(void *stream) {
  return stream ? (uint64_t)((struct memstream *)stream)->pos : 0;
}

WEAK uint8_t *memstream_get_ptr(void *stream, size_t *size) {
  struct memstream *m = (struct memstream *)stream;
  if (!m) return NULL;
  if (size) *size = m->size;
  return m->buf;
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_seek(void *stream, int64_t offset,
                                              int seek_position) {
  printf("[C-Debug] filestream_seek offset:%lld pos:%d\n", (long long)offset, seek_position);
  if (fseeko((FILE *)stream, offset, seek_position) == 0)
    return ftello((FILE *)stream);
  return -1;
}

WEAK int64_t filestream_tell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}

WEAK void filestream_rewind(void *stream) {
  rewind((FILE *)stream);
}

WEAK int filestream_close(void *stream) {
  return fclose((FILE *)stream);
}

WEAK int64_t filestream_read_file(const char *path, void **buf, int64_t *len) {
  FILE *fp = fopen(path, "rb");
  if (!fp) return 0;
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, 0, SEEK_SET);
  void *data = malloc(size);
  if (!data) {
    fclose(fp);
    return 0;
  }
  if (fread(data, 1, size, fp) != (size_t)size) {
    free(data);
    fclose(fp);
    return 0;
  }
  fclose(fp);
  *buf = data;
  *len = size;
  return 1;
}

WEAK bool filestream_exists(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0);
}

WEAK int64_t filestream_get_size(void *stream) {
  FILE *fp = (FILE *)stream;
  if (!fp)
    return 0;
  int64_t curr = ftello(fp);
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, curr, SEEK_SET);
  return size;
}

/* Libretro Common Aliases */
WEAK void *rfopen(const char *path, const char *mode) {
  return (void *)fopen(path, mode);
}
WEAK int64_t rfread(void *buffer, size_t size, size_t count,
                                     void *stream) {
  return (int64_t)fread(buffer, size, count, (FILE *)stream);
}
WEAK int64_t rfwrite(const void *buffer, size_t size,
                                      size_t count, void *stream) {
  return (int64_t)fwrite(buffer, size, count, (FILE *)stream);
}
WEAK int64_t rfseek(void *stream, int64_t offset, int origin) {
  return filestream_seek(stream, offset, origin);
}
WEAK int64_t rftell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}
WEAK int64_t rfsize(void *stream) {
  return filestream_get_size(stream);
}
WEAK char *rfgets(char *s, int len, void *stream) {
  return fgets(s, len, (FILE *)stream);
}
WEAK int rfeof(void *stream) {
  return feof((FILE *)stream);
}
WEAK int rfgetc(void *stream) {
  return fgetc((FILE *)stream);
}
WEAK int rferror(void *stream) {
  return ferror((FILE *)stream);
}
WEAK int rfclose(void *stream) {
  return fclose((FILE *)stream);
}
WEAK int64_t rfget_size(void *stream) {
  return filestream_get_size(stream);
}

/* VFS Callbacks Wrapper */
struct retro_vfs_file_handle {
  FILE *fp;
};

WEAK struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  FILE *fp = fopen(path, vfs_mode_to_string(mode));
  if (!fp)
    return NULL;
  struct retro_vfs_file_handle *handle = malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

WEAK int
retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (stream) {
    fclose(stream->fp);
    free(stream);
  }
  return 0;
}

WEAK int64_t
retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *stream) {
  return filestream_get_size(stream ? stream->fp : NULL);
}

WEAK int64_t retro_vfs_file_read_impl(
    struct retro_vfs_file_handle *stream, void *data, int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, stream->fp);
}

WEAK int64_t retro_vfs_file_write_impl(
    struct retro_vfs_file_handle *stream, const void *data, int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, stream->fp);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_seek_impl(
    struct retro_vfs_file_handle *stream, int64_t offset, int seek_position) {
  if (fseeko(stream->fp, offset, seek_position) == 0)
    return ftello(stream->fp);
  return -1;
}

WEAK int64_t
retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return (int64_t)ftello(stream->fp);
}
