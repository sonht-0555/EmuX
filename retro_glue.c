#define _FILE_OFFSET_BITS 64
#include <dirent.h>
#include <emscripten.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#define GLUE_LOG(fmt, ...) printf("[GLUE] " fmt "\n", ##__VA_ARGS__)

/* Libretro VFS Constants */
#define RETRO_VFS_FILE_ACCESS_READ (1 << 0)
#define RETRO_VFS_FILE_ACCESS_WRITE (1 << 1)
#define RETRO_VFS_FILE_ACCESS_READ_WRITE                                       \
  (RETRO_VFS_FILE_ACCESS_READ | RETRO_VFS_FILE_ACCESS_WRITE)
#define RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING (1 << 2)

#define RETRO_VFS_FILE_ACCESS_HINT_NONE (0)
#define RETRO_VFS_FILE_ACCESS_HINT_FREQUENT_ACCESS (1 << 0)

/* String utilities */
EMSCRIPTEN_KEEPALIVE char *string_to_lower(const char *str) {
  if (!str)
    return NULL;
  char *lower = strdup(str);
  for (int i = 0; lower[i]; i++)
    if (lower[i] >= 'A' && lower[i] <= 'Z')
      lower[i] += 32;
  return lower;
}

/* Audited from libretro-common/string/stdstring.c */
EMSCRIPTEN_KEEPALIVE char *
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

/* Path utilities - Audited from libretro-common/file/file_path.c */
EMSCRIPTEN_KEEPALIVE const char *find_last_slash(const char *str) {
  const char *s1 = strrchr(str, '/'), *s2 = strrchr(str, '\\');
  return (s1 > s2) ? s1 : (s2 ? s2 : s1);
}

EMSCRIPTEN_KEEPALIVE const char *path_basename(const char *path) {
  const char *last = find_last_slash(path);
  return last ? last + 1 : path;
}

EMSCRIPTEN_KEEPALIVE void path_parent_dir(char *path) {
  char *last = (char *)find_last_slash(path);
  if (last)
    *last = '\0';
  else
    *path = '\0';
}

EMSCRIPTEN_KEEPALIVE bool path_is_absolute(const char *path) {
  return (path && (path[0] == '/' ||
                   (strlen(path) > 2 && path[1] == ':' && path[2] == '\\')));
}

EMSCRIPTEN_KEEPALIVE void path_remove_extension(char *path) {
  char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  if (dot && (!slash || dot > slash))
    *dot = '\0';
}

EMSCRIPTEN_KEEPALIVE const char *path_get_extension(const char *path) {
  const char *dot = strrchr(path, '.');
  const char *slash = find_last_slash(path);
  return (dot && (!slash || dot > slash)) ? dot + 1 : "";
}

EMSCRIPTEN_KEEPALIVE bool path_mkdir(const char *dir) {
  return mkdir(dir, 0777) == 0;
}

EMSCRIPTEN_KEEPALIVE bool path_is_directory(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0 && S_ISDIR(st.st_mode));
}

/* Directory utilities */
struct RDIR {
  DIR *d;
  struct dirent *e;
};

EMSCRIPTEN_KEEPALIVE struct RDIR *
retro_opendir_include_hidden(const char *name, bool include_hidden) {
  DIR *d = opendir(name);
  if (!d)
    return NULL;
  struct RDIR *r = malloc(sizeof(struct RDIR));
  r->d = d;
  r->e = NULL;
  return r;
}

EMSCRIPTEN_KEEPALIVE bool retro_readdir(struct RDIR *r) {
  return r && (r->e = readdir(r->d)) != NULL;
}

EMSCRIPTEN_KEEPALIVE const char *retro_dirent_get_name(struct RDIR *r) {
  return r && r->e ? r->e->d_name : NULL;
}

EMSCRIPTEN_KEEPALIVE bool retro_dirent_is_dir(struct RDIR *r,
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

EMSCRIPTEN_KEEPALIVE void retro_closedir(struct RDIR *r) {
  if (r) {
    closedir(r->d);
    free(r);
  }
}

/* Helper to convert Libretro VFS modes to fopen modes */
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

/* Standard File implementation used by filestream and VFS */
EMSCRIPTEN_KEEPALIVE void *filestream_open(const char *path, unsigned mode,
                                           unsigned hints) {
  GLUE_LOG("filestream_open: %s (mode %u)", path, mode);
  return (void *)fopen(path, vfs_mode_to_string(mode));
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_read(void *stream, void *data,
                                             int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, (FILE *)stream);
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_write(void *stream, const void *data,
                                              int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, (FILE *)stream);
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_seek(void *stream, int64_t offset,
                                             int seek_position) {
  return (int64_t)fseeko((FILE *)stream, offset, seek_position);
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_tell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}

EMSCRIPTEN_KEEPALIVE int filestream_close(void *stream) {
  GLUE_LOG("filestream_close: %p", stream);
  return fclose((FILE *)stream);
}

EMSCRIPTEN_KEEPALIVE int64_t filestream_get_size(void *stream) {
  FILE *fp = (FILE *)stream;
  int64_t curr = ftello(fp);
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, curr, SEEK_SET);
  return size;
}

/* Backwards compatibility / Aliases */
EMSCRIPTEN_KEEPALIVE void *rfopen(const char *path, const char *mode) {
  GLUE_LOG("rfopen: %s", path);
  return (void *)fopen(path, mode);
}
EMSCRIPTEN_KEEPALIVE int64_t rfread(void *buffer, size_t size, size_t count,
                                    void *stream) {
  return (int64_t)fread(buffer, size, count, (FILE *)stream);
}
EMSCRIPTEN_KEEPALIVE int64_t rfwrite(const void *buffer, size_t size,
                                     size_t count, void *stream) {
  return (int64_t)fwrite(buffer, size, count, (FILE *)stream);
}
EMSCRIPTEN_KEEPALIVE int64_t rfseek(void *stream, int64_t offset, int origin) {
  return (int64_t)fseeko((FILE *)stream, offset, origin);
}
EMSCRIPTEN_KEEPALIVE int64_t rftell(void *stream) {
  return (int64_t)ftello((FILE *)stream);
}
EMSCRIPTEN_KEEPALIVE int64_t rfsize(void *stream) {
  return filestream_get_size(stream);
}
EMSCRIPTEN_KEEPALIVE int rfclose(void *stream) {
  return filestream_close(stream);
}
EMSCRIPTEN_KEEPALIVE int64_t rfget_size(void *stream) {
  return filestream_get_size(stream);
}

/* VFS Callbacks - Standard signatures from libretro.h */
struct retro_vfs_file_handle {
  FILE *fp;
};

EMSCRIPTEN_KEEPALIVE struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  FILE *fp = fopen(path, vfs_mode_to_string(mode));
  if (!fp)
    return NULL;
  struct retro_vfs_file_handle *handle = malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

EMSCRIPTEN_KEEPALIVE int
retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (!stream)
    return 0;
  fclose(stream->fp);
  free(stream);
  return 0;
}

EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *stream) {
  return filestream_get_size(stream ? stream->fp : NULL);
}

EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_read_impl(
    struct retro_vfs_file_handle *stream, void *data, int64_t len) {
  return (int64_t)fread(data, 1, (size_t)len, stream->fp);
}

EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_write_impl(
    struct retro_vfs_file_handle *stream, const void *data, int64_t len) {
  return (int64_t)fwrite(data, 1, (size_t)len, stream->fp);
}

EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_seek_impl(
    struct retro_vfs_file_handle *stream, int64_t offset, int seek_position) {
  return (int64_t)fseeko(stream->fp, offset, seek_position);
}

EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return (int64_t)ftello(stream->fp);
}
