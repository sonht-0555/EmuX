#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#define GLUE_LOG(fmt, ...) printf("[GLUE] " fmt "\n", ##__VA_ARGS__)

/* String utilities */
char *string_to_lower(const char *str) {
  if (!str)
    return NULL;
  char *result = (char *)malloc(strlen(str) + 1);
  if (!result)
    return NULL;
  for (size_t i = 0; str[i]; i++)
    result[i] = tolower((unsigned char)str[i]);
  result[strlen(str)] = '\0';
  return result;
}

char *path_basename(const char *path) {
  const char *last_slash = strrchr(path, '/');
  if (!last_slash)
    last_slash = strrchr(path, '\\');
  return (char *)(last_slash ? last_slash + 1 : path);
}

const char *find_last_slash(const char *str) {
  const char *slash = strrchr(str, '/');
  if (!slash)
    slash = strrchr(str, '\\');
  return slash;
}

void fill_pathname_base(char *out, const char *in, size_t size) {
  const char *base = path_basename(in);
  strncpy(out, base, size - 1);
  out[size - 1] = '\0';
}

/* Directory utilities */
int path_mkdir(const char *dir) {
  GLUE_LOG("path_mkdir: %s", dir);
  return mkdir(dir, 0777);
}

int path_is_directory(const char *path) {
  struct stat st;
  return (stat(path, &st) == 0 && S_ISDIR(st.st_mode));
}

/* Directory traversal */
typedef struct {
  DIR *dir;
  struct dirent *last_entry;
} RDIR;

void *retro_opendir_include_hidden(const char *name, bool include_hidden) {
  DIR *d = opendir(name);
  if (!d)
    return NULL;
  RDIR *r = (RDIR *)malloc(sizeof(RDIR));
  r->dir = d;
  r->last_entry = NULL;
  return r;
}

void *retro_opendir(const char *name) {
  return retro_opendir_include_hidden(name, false);
}

bool retro_readdir(void *dirp) {
  if (!dirp)
    return false;
  RDIR *r = (RDIR *)dirp;
  r->last_entry = readdir(r->dir);
  return r->last_entry != NULL;
}

const char *retro_dirent_get_name(void *dirp) {
  if (!dirp)
    return NULL;
  return ((RDIR *)dirp)->last_entry ? ((RDIR *)dirp)->last_entry->d_name : NULL;
}

bool retro_dirent_is_dir(void *dirp, const char *path) {
  return path_is_directory(path);
}

void retro_closedir(void *dirp) {
  if (!dirp)
    return;
  RDIR *r = (RDIR *)dirp;
  closedir(r->dir);
  free(r);
}

/* Legacy RFILE API (still used by some FBNeo code) */
void *rfopen(const char *path, const char *mode) {
  GLUE_LOG("rfopen START: %s (mode: %s)", path, mode);
  FILE *result = fopen(path, mode);
  GLUE_LOG("rfopen END: %p", result);
  return (void *)result;
}

int rfclose(void *stream) {
  GLUE_LOG("rfclose: %p", stream);
  return stream ? fclose((FILE *)stream) : -1;
}

int64_t rfread(void *buffer, size_t elem_size, size_t elem_count,
               void *stream) {
  int64_t len = elem_size * elem_count;
  GLUE_LOG("rfread START: stream=%p, len=%lld", stream, (long long)len);
  int64_t result =
      stream ? (int64_t)fread(buffer, elem_size, elem_count, (FILE *)stream)
             : 0;
  GLUE_LOG("rfread END: %lld elements", (long long)result);
  return result;
}

int64_t rfwrite(const void *buffer, size_t elem_size, size_t elem_count,
                void *stream) {
  int64_t len = elem_size * elem_count;
  GLUE_LOG("rfwrite: stream=%p, len=%lld", stream, (long long)len);
  return stream ? (int64_t)fwrite(buffer, elem_size, elem_count, (FILE *)stream)
                : 0;
}

int64_t rfseek(void *stream, int64_t offset, int origin) {
  GLUE_LOG("rfseek: stream=%p, offset=%lld, origin=%d", stream,
           (long long)offset, origin);
  return stream ? (int64_t)fseeko((FILE *)stream, (off_t)offset, origin) : -1;
}

int64_t rftell(void *stream) {
  int64_t pos = stream ? (int64_t)ftello((FILE *)stream) : -1;
  GLUE_LOG("rftell: stream=%p -> %lld", stream, (long long)pos);
  return pos;
}

int64_t rfsize(void *stream) {
  GLUE_LOG("rfsize START: %p", stream);
  if (!stream)
    return 0;
  FILE *f = (FILE *)stream;
  off_t curr = ftello(f);
  fseeko(f, 0, SEEK_END);
  off_t size = ftello(f);
  fseeko(f, curr, SEEK_SET);
  GLUE_LOG("rfsize END: %lld", (long long)size);
  return (int64_t)size;
}

int rferror(void *stream) { return stream ? ferror((FILE *)stream) : 1; }

int rfgetc(void *stream) { return stream ? fgetc((FILE *)stream) : EOF; }

char *rfgets(char *str, int num, void *stream) {
  return stream ? fgets(str, num, (FILE *)stream) : NULL;
}

/* VFS Layer (modern FBNeo) */
struct retro_vfs_file_handle {
  FILE *fp;
  char *path;
};

struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  GLUE_LOG("VFS open: %s", path);
  const char *mode_str = (mode & 0x2) ? "rb" : "wb";
  if (mode & 0x4)
    mode_str = "ab";

  FILE *fp = fopen(path, mode_str);
  if (!fp)
    return NULL;

  struct retro_vfs_file_handle *handle = malloc(sizeof(*handle));
  handle->fp = fp;
  handle->path = strdup(path);
  return handle;
}

int retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (!stream)
    return -1;
  fclose(stream->fp);
  free(stream->path);
  free(stream);
  return 0;
}

int64_t retro_vfs_file_size_impl(struct retro_vfs_file_handle *stream) {
  if (!stream)
    return -1;
  off_t curr = ftello(stream->fp);
  fseeko(stream->fp, 0, SEEK_END);
  off_t size = ftello(stream->fp);
  fseeko(stream->fp, curr, SEEK_SET);
  return size;
}

int64_t retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return stream ? ftello(stream->fp) : -1;
}

int64_t retro_vfs_file_seek_impl(struct retro_vfs_file_handle *stream,
                                 int64_t offset, int seek_position) {
  if (!stream)
    return -1;
  return fseeko(stream->fp, offset, seek_position);
}

int64_t retro_vfs_file_read_impl(struct retro_vfs_file_handle *stream, void *s,
                                 uint64_t len) {
  return stream ? fread(s, 1, len, stream->fp) : 0;
}

int64_t retro_vfs_file_write_impl(struct retro_vfs_file_handle *stream,
                                  const void *s, uint64_t len) {
  return stream ? fwrite(s, 1, len, stream->fp) : 0;
}

int retro_vfs_file_flush_impl(struct retro_vfs_file_handle *stream) {
  return stream ? fflush(stream->fp) : -1;
}

int retro_vfs_file_remove_impl(const char *path) { return remove(path); }

int retro_vfs_file_rename_impl(const char *old_path, const char *new_path) {
  return rename(old_path, new_path);
}

const char *retro_vfs_file_get_path_impl(struct retro_vfs_file_handle *stream) {
  return stream ? stream->path : NULL;
}

int retro_vfs_stat_impl(const char *path, int32_t *size) {
  struct stat st;
  if (stat(path, &st) < 0)
    return 0;
  if (size)
    *size = st.st_size;
  return S_ISDIR(st.st_mode) ? 2 : 1;
}

int retro_vfs_mkdir_impl(const char *dir) { return mkdir(dir, 0777); }
