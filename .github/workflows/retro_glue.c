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
WEAK EMSCRIPTEN_KEEPALIVE uint32_t encoding_crc32(uint32_t crc, const uint8_t *data, size_t len) {
  return (uint32_t)crc32((unsigned long)crc, (const unsigned char *)data, (unsigned int)len);
}

WEAK EMSCRIPTEN_KEEPALIVE char *string_trim_whitespace_right(char *str) {
  if (!str) return NULL;
  char *end = str + strlen(str) - 1;
  while (end >= str && (*end == ' ' || *end == '\t' || *end == '\n' || *end == '\r')) {
    *end = '\0';
    end--;
  }
  return str;
}

WEAK EMSCRIPTEN_KEEPALIVE size_t strlcpy_retro__(char *dest, const char *src, size_t size) {
  size_t i;
  for (i = 0; i < size - 1 && src[i] != '\0'; i++) dest[i] = src[i];
  if (size > 0) dest[i] = '\0';
  while (src[i] != '\0') i++;
  return i;
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
WEAK EMSCRIPTEN_KEEPALIVE char *string_to_lower(const char *str) {
  if (!str)
    return NULL;
  char *lower = strdup(str);
  for (int i = 0; lower[i]; i++)
    if (lower[i] >= 'A' && lower[i] <= 'Z')
      lower[i] += 32;
  return lower;
}

WEAK EMSCRIPTEN_KEEPALIVE char *
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
WEAK EMSCRIPTEN_KEEPALIVE const char *find_last_slash(const char *str) {
  const char *s1 = strrchr(str, '/'), *s2 = strrchr(str, '\\');
  return (s1 > s2) ? s1 : (s2 ? s2 : s1);
}

WEAK EMSCRIPTEN_KEEPALIVE const char *path_basename(const char *path) {
  const char *last = find_last_slash(path);
  return last ? last + 1 : path;
}

WEAK EMSCRIPTEN_KEEPALIVE void path_parent_dir(char *path) {
  char *last = (char *)find_last_slash(path);
  if (last)
    *last = '\0';
  else
    *path = '\0';
}

WEAK EMSCRIPTEN_KEEPALIVE bool path_is_absolute(const char *path) {
  return (path && (path[0] == '/' ||
                   (strlen(path) > 2 && path[1] == ':' && path[2] == '\\')));
}

WEAK EMSCRIPTEN_KEEPALIVE void path_remove_extension(char *path) {
  char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  if (dot && (!slash || dot > slash))
    *dot = '\0';
}

WEAK EMSCRIPTEN_KEEPALIVE const char *path_get_extension(const char *path) {
  const char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  return (dot && (!slash || dot > slash)) ? dot + 1 : "";
}

WEAK EMSCRIPTEN_KEEPALIVE bool path_mkdir(const char *dir) {
  return mkdir(dir, 0777) == 0;
}

WEAK EMSCRIPTEN_KEEPALIVE bool path_is_directory(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0 && S_ISDIR(st.st_mode));
}

/* Directory utilities */
struct RDIR {
  DIR *d;
  struct dirent *e;
};

WEAK EMSCRIPTEN_KEEPALIVE struct RDIR *
retro_opendir_include_hidden(const char *name, bool include_hidden) {
  DIR *d = opendir(name);
  if (!d)
    return NULL;
  struct RDIR *r = malloc(sizeof(struct RDIR));
  r->d = d;
  r->e = NULL;
  return r;
}

WEAK EMSCRIPTEN_KEEPALIVE bool retro_readdir(struct RDIR *r) {
  return r && (r->e = readdir(r->d)) != NULL;
}

WEAK EMSCRIPTEN_KEEPALIVE const char *retro_dirent_get_name(struct RDIR *r) {
  return r && r->e ? r->e->d_name : NULL;
}

WEAK EMSCRIPTEN_KEEPALIVE bool retro_dirent_is_dir(struct RDIR *r,
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

WEAK EMSCRIPTEN_KEEPALIVE void retro_closedir(struct RDIR *r) {
  if (r) {
    closedir(r->d);
    free(r);
  }
}

/* File I/O utilities */
static const char *vfs_mode_to_string(unsigned mode) {
  if (mode == RETRO_VFS_FILE_ACCESS_READ)
    return "rb";
  if (mode == RETRO_VFS_FILE_ACCESS_WRITE)
    return "wb";
  if (mode == RETRO_VFS_FILE_ACCESS_READ_WRITE)
    return "w+b";
  if (mode == (RETRO_VFS_FILE_ACCESS_READ_WRITE |
               RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING))
    return "r+b";
  return "rb";
}

WEAK EMSCRIPTEN_KEEPALIVE void *filestream_open(const char *path, unsigned mode,
                                           unsigned hints) {
  return (void *)fopen(path, vfs_mode_to_string(mode));
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_read(void *stream, void *data,
                                              int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, (FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_write(void *stream, const void *data,
                                               int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, (FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE char *filestream_gets(void *stream, char *s, size_t len) {
  return fgets(s, (int)len, (FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE int filestream_eof(void *stream) {
  return feof((FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE int filestream_getc(void *stream) {
  return fgetc((FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE int filestream_error(void *stream) {
  return ferror((FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE void filestream_vfs_init(void) {
  /* Dummy */
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_seek(void *stream, int64_t offset,
                                              int seek_position) {
  return (int64_t)fseeko((FILE *)stream, offset, seek_position);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_tell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}

WEAK EMSCRIPTEN_KEEPALIVE int filestream_close(void *stream) {
  return fclose((FILE *)stream);
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_read_file(const char *path, void **buf, int64_t *len) {
  FILE *fp = fopen(path, "rb");
  if (!fp) return 0;
  fseek(fp, 0, SEEK_END);
  int64_t size = ftell(fp);
  fseek(fp, 0, SEEK_SET);
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

WEAK EMSCRIPTEN_KEEPALIVE bool filestream_exists(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t filestream_get_size(void *stream) {
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
WEAK EMSCRIPTEN_KEEPALIVE void *rfopen(const char *path, const char *mode) {
  return (void *)fopen(path, mode);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rfread(void *buffer, size_t size, size_t count,
                                     void *stream) {
  return (int64_t)fread(buffer, size, count, (FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rfwrite(const void *buffer, size_t size,
                                      size_t count, void *stream) {
  return (int64_t)fwrite(buffer, size, count, (FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rfseek(void *stream, int64_t offset, int origin) {
  return (int64_t)fseeko((FILE *)stream, offset, origin);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rftell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rfsize(void *stream) {
  return filestream_get_size(stream);
}
WEAK EMSCRIPTEN_KEEPALIVE char *rfgets(char *s, int len, void *stream) {
  return fgets(s, len, (FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int rfeof(void *stream) {
  return feof((FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int rfgetc(void *stream) {
  return fgetc((FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int rferror(void *stream) {
  return ferror((FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int rfclose(void *stream) {
  return fclose((FILE *)stream);
}
WEAK EMSCRIPTEN_KEEPALIVE int64_t rfget_size(void *stream) {
  return filestream_get_size(stream);
}

/* VFS Callbacks Wrapper */
struct retro_vfs_file_handle {
  FILE *fp;
};

WEAK EMSCRIPTEN_KEEPALIVE struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  FILE *fp = fopen(path, vfs_mode_to_string(mode));
  if (!fp)
    return NULL;
  struct retro_vfs_file_handle *handle = malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

WEAK EMSCRIPTEN_KEEPALIVE int
retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (stream) {
    fclose(stream->fp);
    free(stream);
  }
  return 0;
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *stream) {
  return filestream_get_size(stream ? stream->fp : NULL);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_read_impl(
    struct retro_vfs_file_handle *stream, void *data, int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, stream->fp);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_write_impl(
    struct retro_vfs_file_handle *stream, const void *data, int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, stream->fp);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_seek_impl(
    struct retro_vfs_file_handle *stream, int64_t offset, int seek_position) {
  return (int64_t)fseeko(stream->fp, offset, seek_position);
}

WEAK EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return (int64_t)ftello(stream->fp);
}
