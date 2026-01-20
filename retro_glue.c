#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

/* Fixed signatures to match libretro-common standard exactly */

/* Legacy RFILE API */
void *rfopen(const char *path, const char *mode) {
  return (void *)fopen(path, mode);
}

/* IMPORTANT: rfread in libretro-common takes 3 arguments: stream, data, len */
int64_t rfread(void *stream, void *buffer, int64_t len) {
  return (int64_t)fread(buffer, 1, (size_t)len, (FILE *)stream);
}

/* IMPORTANT: rfwrite in libretro-common takes 3 arguments: stream, data, len */
int64_t rfwrite(void *stream, const void *buffer, int64_t len) {
  return (int64_t)fwrite(buffer, 1, (size_t)len, (FILE *)stream);
}

int64_t rfseek(void *stream, int64_t offset, int origin) {
  return (int64_t)fseeko((FILE *)stream, offset, origin);
}

int64_t rftell(void *stream) { return (int64_t)ftello((FILE *)stream); }

int64_t rfsize(void *stream) {
  FILE *fp = (FILE *)stream;
  int64_t curr = ftello(fp);
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, curr, SEEK_SET);
  return size;
}

int rfclose(void *stream) {
  if (!stream)
    return 0;
  return fclose((FILE *)stream);
}

/* Modern VFS Layer */
struct retro_vfs_file_handle {
  FILE *fp;
};

struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *path, unsigned mode, unsigned hints) {
  const char *mode_str = "rb";
  if (mode & (1 << 1))
    mode_str = "wb"; // RETRO_VFS_FILE_ACCESS_WRITE
  if (mode & (1 << 2))
    mode_str = "r+b"; // UPDATE

  FILE *fp = fopen(path, mode_str);
  if (!fp)
    return NULL;

  struct retro_vfs_file_handle *handle =
      (struct retro_vfs_file_handle *)malloc(sizeof(*handle));
  handle->fp = fp;
  return handle;
}

int retro_vfs_file_close_impl(struct retro_vfs_file_handle *stream) {
  if (!stream)
    return 0;
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

/* Aliases for some core versions */
int64_t rfget_size(void *stream) { return rfsize(stream); }
void *filestream_open(const char *path, const char *mode) {
  return rfopen(path, mode);
}
int64_t filestream_read(void *stream, void *buffer, int64_t len) {
  return rfread(stream, buffer, len);
}
int64_t filestream_write(void *stream, const void *buffer, int64_t len) {
  return rfwrite(stream, buffer, len);
}
int64_t filestream_seek(void *stream, int64_t offset, int origin) {
  return rfseek(stream, offset, origin);
}
int64_t filestream_tell(void *stream) { return rftell(stream); }
int filestream_close(void *stream) { return rfclose(stream); }
int64_t filestream_get_size(void *stream) { return rfsize(stream); }
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
int path_mkdir(const char *path) { return mkdir(path, 0777); }
