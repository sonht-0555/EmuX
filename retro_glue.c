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
  char *lower = strdup(str);
  for (int i = 0; lower[i]; i++) {
    if (lower[i] >= 'A' && lower[i] <= 'Z')
      lower[i] += 32;
  }
  return lower;
}

/* Missing function required by FBNeo */
char *string_replace_substring(const char *in, const char *pattern,
                               const char *by) {
  if (!in || !pattern || !by)
    return NULL;
  size_t in_len = strlen(in);
  size_t pattern_len = strlen(pattern);
  size_t by_len = strlen(by);
  if (pattern_len == 0)
    return strdup(in);

  size_t count = 0;
  const char *tmp = in;
  while ((tmp = strstr(tmp, pattern))) {
    count++;
    tmp += pattern_len;
  }

  size_t res_len = in_len + count * (by_len - pattern_len);
  char *res = (char *)malloc(res_len + 1);
  if (!res)
    return NULL;

  char *dst = res;
  while (*in) {
    if (strstr(in, pattern) == in) {
      strcpy(dst, by);
      dst += by_len;
      in += pattern_len;
    } else {
      *dst++ = *in++;
    }
  }
  *dst = '\0';
  return res;
}

/* Directory/Path utilities */
int path_mkdir(const char *path) {
  GLUE_LOG("path_mkdir: %s", path);
  return mkdir(path, 0777);
}

int path_is_directory(const char *path) {
  struct stat st;
  if (stat(path, &st) == 0)
    return S_ISDIR(st.st_mode);
  return 0;
}

/* Legacy RFILE API (Required by FBNeo) */
void *rfopen(const char *path, const char *mode) {
  GLUE_LOG("rfopen: %s", path);
  return (void *)fopen(path, mode);
}

int64_t rfread(void *buffer, size_t size, size_t count, void *stream) {
  GLUE_LOG("rfread START: stream=%p, len=%zu", stream, size * count);
  int64_t ret = (int64_t)fread(buffer, size, count, (FILE *)stream);
  GLUE_LOG("rfread END: %lld elements", ret);
  return ret;
}

int64_t rfwrite(const void *buffer, size_t size, size_t count, void *stream) {
  return (int64_t)fwrite(buffer, size, count, (FILE *)stream);
}

int64_t rfseek(void *stream, int64_t offset, int origin) {
  GLUE_LOG("rfseek: stream=%p, offset=%lld, origin=%d", stream, offset, origin);
  return (int64_t)fseeko((FILE *)stream, offset, origin);
}

int64_t rftell(void *stream) {
  int64_t ret = (int64_t)ftello((FILE *)stream);
  GLUE_LOG("rftell: stream=%p -> %lld", stream, ret);
  return ret;
}

int64_t rfsize(void *stream) {
  FILE *fp = (FILE *)stream;
  int64_t curr = ftello(fp);
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, curr, SEEK_SET);
  return size;
}

int rfclose(void *stream) {
  GLUE_LOG("rfclose: %p", stream);
  return fclose((FILE *)stream);
}

/* Modern VFS Layer */
struct retro_vfs_file_handle {
  FILE *fp;
};

struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  GLUE_LOG("VFS open: %s", path);
  const char *mode_str = "rb";
  if (mode == 2)
    mode_str = "wb"; // RETRO_VFS_FILE_ACCESS_WRITE
  if (mode == 3)
    mode_str = "r+b"; // READ_WRITE

  FILE *fp = fopen(path, mode_str);
  if (!fp)
    return NULL;

  struct retro_vfs_file_handle *handle =
      (struct retro_vfs_file_handle *)malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

int retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  int ret = fclose(stream->fp);
  free(stream);
  return ret;
}

int64_t retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *stream) {
  int64_t curr = ftello(stream->fp);
  fseeko(stream->fp, 0, SEEK_END);
  int64_t size = ftello(stream->fp);
  fseeko(stream->fp, curr, SEEK_SET);
  return size;
}

int64_t retro_vfs_file_read_impl(struct retro_vfs_file_handle *stream, void *s,
                                 int64_t len) {
  return fread(s, 1, len, stream->fp);
}

int64_t retro_vfs_file_write_impl(struct retro_vfs_file_handle *stream,
                                  const void *s, int64_t len) {
  return fwrite(s, 1, len, stream->fp);
}

int64_t retro_vfs_file_seek_impl(struct retro_vfs_file_handle *stream,
                                 int64_t offset, int seek_position) {
  return fseeko(stream->fp, offset, seek_position);
}

int64_t retro_vfs_file_tell_impl(struct retro_vfs_file_handle *stream) {
  return ftello(stream->fp);
}

/* Required by some core loops */
int64_t rfget_size(void *stream) { return rfsize(stream); }
void *filestream_open(const char *path, const char *mode) {
  return rfopen(path, mode);
}
int64_t filestream_read(void *stream, void *buffer, size_t size) {
  return rfread(buffer, 1, size, stream);
}
int64_t filestream_seek(void *stream, int64_t offset, int origin) {
  return rfseek(stream, offset, origin);
}
int64_t filestream_tell(void *stream) { return rftell(stream); }
int filestream_close(void *stream) { return rfclose(stream); }
int64_t filestream_get_size(void *stream) { return rfsize(stream); }
