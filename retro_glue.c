#define _FILE_OFFSET_BITS 64
#include <dirent.h>
#include <emscripten.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <zlib.h>

#define GLUE_LOG(fmt, ...) printf("[GLUE] " fmt "\n", ##__VA_ARGS__)

/* ZIP file signatures */
#define ZIP_LOCAL_FILE_HEADER_SIG 0x04034b50
#define ZIP_CENTRAL_DIR_HEADER_SIG 0x02014b50
#define ZIP_END_OF_CENTRAL_DIR_SIG 0x06054b50

/* ZIP compression methods */
#define ZIP_STORED 0
#define ZIP_DEFLATED 8

/* Helper to read little-endian values */
static inline uint32_t read_le32(const uint8_t *data) {
  return data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
}

static inline uint16_t read_le16(const uint8_t *data) {
  return data[0] | (data[1] << 8);
}

/* ZIP file entry structure */
typedef struct {
  char filename[256];
  uint32_t compressed_size;
  uint32_t uncompressed_size;
  uint32_t offset;
  uint16_t compression_method;
} zip_entry_t;

/* Simple ZIP context */
typedef struct {
  FILE *fp;
  zip_entry_t *entries;
  int entry_count;
} zip_context_t;

/* Open and parse ZIP file */
static zip_context_t *zip_open(const char *path) {
  FILE *fp = fopen(path, "rb");
  if (!fp)
    return NULL;

  /* Find end of central directory */
  fseek(fp, -22, SEEK_END);
  uint8_t eocd[22];
  if (fread(eocd, 1, 22, fp) != 22) {
    fclose(fp);
    return NULL;
  }

  if (read_le32(eocd) != ZIP_END_OF_CENTRAL_DIR_SIG) {
    fclose(fp);
    return NULL;
  }

  uint16_t entry_count = read_le16(eocd + 10);
  uint32_t central_dir_size = read_le32(eocd + 12);
  uint32_t central_dir_offset = read_le32(eocd + 16);

  /* Read central directory */
  fseek(fp, central_dir_offset, SEEK_SET);
  uint8_t *central_dir = malloc(central_dir_size);
  if (fread(central_dir, 1, central_dir_size, fp) != central_dir_size) {
    free(central_dir);
    fclose(fp);
    return NULL;
  }

  /* Parse entries */
  zip_context_t *ctx = malloc(sizeof(zip_context_t));
  ctx->fp = fp;
  ctx->entry_count = entry_count;
  ctx->entries = malloc(sizeof(zip_entry_t) * entry_count);

  uint8_t *ptr = central_dir;
  for (int i = 0; i < entry_count; i++) {
    if (read_le32(ptr) != ZIP_CENTRAL_DIR_HEADER_SIG)
      break;

    uint16_t name_len = read_le16(ptr + 28);
    uint16_t extra_len = read_le16(ptr + 30);
    uint16_t comment_len = read_le16(ptr + 32);

    ctx->entries[i].compression_method = read_le16(ptr + 10);
    ctx->entries[i].compressed_size = read_le32(ptr + 20);
    ctx->entries[i].uncompressed_size = read_le32(ptr + 24);
    ctx->entries[i].offset = read_le32(ptr + 42);

    memcpy(ctx->entries[i].filename, ptr + 46, name_len);
    ctx->entries[i].filename[name_len] = '\0';

    ptr += 46 + name_len + extra_len + comment_len;
  }

  free(central_dir);
  return ctx;
}

/* Extract a file from ZIP */
static uint8_t *zip_extract(zip_context_t *ctx, const char *filename,
                            size_t *out_size) {
  /* Find entry */
  zip_entry_t *entry = NULL;
  for (int i = 0; i < ctx->entry_count; i++) {
    if (strcmp(ctx->entries[i].filename, filename) == 0) {
      entry = &ctx->entries[i];
      break;
    }
  }
  if (!entry)
    return NULL;

  /* Seek to local file header */
  fseek(ctx->fp, entry->offset, SEEK_SET);
  uint8_t local_header[30];
  fread(local_header, 1, 30, ctx->fp);

  uint16_t name_len = read_le16(local_header + 26);
  uint16_t extra_len = read_le16(local_header + 28);
  fseek(ctx->fp, name_len + extra_len, SEEK_CUR);

  /* Read compressed data */
  uint8_t *compressed = malloc(entry->compressed_size);
  fread(compressed, 1, entry->compressed_size, ctx->fp);

  uint8_t *uncompressed = malloc(entry->uncompressed_size);

  if (entry->compression_method == ZIP_STORED) {
    /* No compression */
    memcpy(uncompressed, compressed, entry->uncompressed_size);
  } else if (entry->compression_method == ZIP_DEFLATED) {
    /* Decompress with zlib */
    z_stream stream = {0};
    stream.next_in = compressed;
    stream.avail_in = entry->compressed_size;
    stream.next_out = uncompressed;
    stream.avail_out = entry->uncompressed_size;

    inflateInit2(&stream, -MAX_WBITS);
    inflate(&stream, Z_FINISH);
    inflateEnd(&stream);
  }

  free(compressed);
  *out_size = entry->uncompressed_size;
  return uncompressed;
}

static void zip_close(zip_context_t *ctx) {
  if (ctx) {
    if (ctx->fp)
      fclose(ctx->fp);
    if (ctx->entries)
      free(ctx->entries);
    free(ctx);
  }
}

/* --- String Utilities --- */
EMSCRIPTEN_KEEPALIVE char *string_to_lower(const char *str) {
  if (!str)
    return NULL;
  char *lower = strdup(str);
  for (int i = 0; lower[i]; i++)
    if (lower[i] >= 'A' && lower[i] <= 'Z')
      lower[i] += 32;
  return lower;
}

EMSCRIPTEN_KEEPALIVE char *
string_replace_substring(const char *in, const char *p, const char *by) {
  if (!in || !p || !by)
    return NULL;
  size_t in_len = strlen(in), p_len = strlen(p), by_len = strlen(by);
  size_t count = 0;
  const char *tmp = in;
  while ((tmp = strstr(tmp, p))) {
    count++;
    tmp += p_len;
  }
  char *res = malloc(in_len + count * (by_len - p_len) + 1);
  char *dst = res;
  while (*in) {
    if (strstr(in, p) == in) {
      strcpy(dst, by);
      dst += by_len;
      in += p_len;
    } else
      *dst++ = *in++;
  }
  *dst = '\0';
  return res;
}

/* --- Path Utilities --- */
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

EMSCRIPTEN_KEEPALIVE int path_is_absolute(const char *path) {
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

EMSCRIPTEN_KEEPALIVE int path_mkdir(const char *p) { return mkdir(p, 0777); }
EMSCRIPTEN_KEEPALIVE int path_is_directory(const char *p) {
  struct stat st;
  return (stat(p, &st) == 0 && S_ISDIR(st.st_mode));
}

/* --- Directory Utilities --- */
struct RDIR {
  DIR *d;
  struct dirent *e;
};
EMSCRIPTEN_KEEPALIVE struct RDIR *retro_opendir_include_hidden(const char *n,
                                                               bool h) {
  DIR *d = opendir(n);
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
EMSCRIPTEN_KEEPALIVE bool retro_dirent_is_dir(struct RDIR *r, const char *p) {
  if (!r || !r->e)
    return false;
  if (r->e->d_type == DT_DIR)
    return true;
  char fp[1024];
  snprintf(fp, 1024, "%s/%s", p, r->e->d_name);
  struct stat st;
  return (stat(fp, &st) == 0 && S_ISDIR(st.st_mode));
}
EMSCRIPTEN_KEEPALIVE void retro_closedir(struct RDIR *r) {
  if (r) {
    closedir(r->d);
    free(r);
  }
}

/* --- RFILE API (64-bit) --- */
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
  FILE *fp = (FILE *)stream;
  int64_t curr = ftello(fp);
  fseeko(fp, 0, SEEK_END);
  int64_t size = ftello(fp);
  fseeko(fp, curr, SEEK_SET);
  return size;
}
EMSCRIPTEN_KEEPALIVE int rfclose(void *stream) {
  GLUE_LOG("rfclose: %p", stream);
  return fclose((FILE *)stream);
}

/* --- filestream aliases --- */
EMSCRIPTEN_KEEPALIVE void *filestream_open(const char *p, const char *m) {
  return rfopen(p, m);
}
EMSCRIPTEN_KEEPALIVE int64_t filestream_read(void *s, void *b, int64_t l) {
  return rfread(b, 1, (size_t)l, s);
}
EMSCRIPTEN_KEEPALIVE int64_t filestream_write(void *s, const void *b,
                                              int64_t l) {
  return rfwrite(b, 1, (size_t)l, s);
}
EMSCRIPTEN_KEEPALIVE int64_t filestream_seek(void *s, int64_t o, int r) {
  return rfseek(s, o, r);
}
EMSCRIPTEN_KEEPALIVE int64_t filestream_tell(void *s) { return rftell(s); }
EMSCRIPTEN_KEEPALIVE int filestream_close(void *s) { return rfclose(s); }
EMSCRIPTEN_KEEPALIVE int64_t filestream_get_size(void *s) { return rfsize(s); }
EMSCRIPTEN_KEEPALIVE int64_t rfget_size(void *s) { return rfsize(s); }

/* --- VFS --- */
struct retro_vfs_file_handle {
  FILE *fp;
};
EMSCRIPTEN_KEEPALIVE struct retro_vfs_file_handle *
retro_vfs_file_open_impl(const char *p, unsigned m, unsigned h) {
  const char *sm = (m == 2) ? "wb" : (m == 3 ? "r+b" : "rb");
  FILE *fp = fopen(p, sm);
  if (!fp)
    return NULL;
  struct retro_vfs_file_handle *rh = malloc(sizeof(*rh));
  rh->fp = fp;
  return rh;
}
EMSCRIPTEN_KEEPALIVE int
retro_vfs_file_close_impl(struct retro_vfs_file_handle *s) {
  if (!s)
    return 0;
  fclose(s->fp);
  free(s);
  return 0;
}
EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *s) {
  return rfsize(s ? s->fp : NULL);
}
EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_read_impl(struct retro_vfs_file_handle *s, void *b, int64_t l) {
  return rfread(b, 1, (size_t)l, s->fp);
}
EMSCRIPTEN_KEEPALIVE int64_t retro_vfs_file_write_impl(
    struct retro_vfs_file_handle *s, const void *b, int64_t l) {
  return rfwrite(b, 1, (size_t)l, s->fp);
}
EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_seek_impl(struct retro_vfs_file_handle *s, int64_t o, int p) {
  return rfseek(s->fp, o, p);
}
EMSCRIPTEN_KEEPALIVE int64_t
retro_vfs_file_tell_impl(struct retro_vfs_file_handle *s) {
  return rftell(s->fp);
}

/* --- ZIP API for FBNeo --- */
EMSCRIPTEN_KEEPALIVE void *zip_open_file(const char *path) {
  GLUE_LOG("zip_open: %s", path);
  return zip_open(path);
}

EMSCRIPTEN_KEEPALIVE void *zip_extract_file(void *ctx, const char *filename,
                                            size_t *size) {
  return zip_extract((zip_context_t *)ctx, filename, size);
}

EMSCRIPTEN_KEEPALIVE void zip_close_file(void *ctx) {
  zip_close((zip_context_t *)ctx);
}
