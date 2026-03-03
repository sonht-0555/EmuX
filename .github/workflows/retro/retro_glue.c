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
#define W    WEAK EMSCRIPTEN_KEEPALIVE
#define RETRO_VFS_FILE_ACCESS_READ             (1 << 0)
#define RETRO_VFS_FILE_ACCESS_WRITE            (1 << 1)
#define RETRO_VFS_FILE_ACCESS_READ_WRITE       (RETRO_VFS_FILE_ACCESS_READ | RETRO_VFS_FILE_ACCESS_WRITE)
#define RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING  (1 << 2)
#define RETRO_VFS_FILE_ACCESS_HINT_NONE              (0)
#define RETRO_VFS_FILE_ACCESS_HINT_FREQUENT_ACCESS   (1 << 0)
/* ── strl ── */
W size_t strlcpy_retro__(char *d, const char *s, size_t n) {
  size_t i;
  if (!n) return strlen(s);
  for (i = 0; i < n - 1 && s[i]; i++) d[i] = s[i];
  d[i] = '\0';
  return strlen(s);
}
W size_t strlcat_retro__(char *d, const char *s, size_t n) {
  size_t dl = strlen(d), sl = strlen(s);
  if (dl >= n) return n + sl;
  for (size_t i = 0; i < n - dl - 1 && s[i]; i++) d[dl + i] = s[i];
  d[dl + (n - dl - 1 < sl ? n - dl - 1 : sl)] = '\0';
  return dl + sl;
}
/* ── String ── */
W char *string_to_lower(const char *str) {
  if (!str) return NULL;
  char *l = strdup(str);
  for (int i = 0; l[i]; i++) if (l[i] >= 'A' && l[i] <= 'Z') l[i] |= 0x20;
  return l;
}
/* ── Path ── */
W const char *find_last_slash(const char *s) {
  const char *a = strrchr(s, '/'), *b = strrchr(s, '\\');
  return a > b ? a : (b ? b : a);
}
W void path_parent_dir(char *p) {
  char *l = (char *)find_last_slash(p);
  *(l ? l : p) = '\0';
}
W bool path_is_absolute(const char *p) {
  return p && (p[0] == '/' || (strlen(p) > 2 && p[1] == ':' && p[2] == '\\'));
}
W void path_remove_extension(char *p) {
  char *dot = strrchr(p, '.');
  const char *sl = find_last_slash(p);
  if (dot && (!sl || dot > sl)) *dot = '\0';
}
W bool path_is_valid(const char *p) { return p && *p; }
W void fill_pathname_join(char *out, const char *dir, const char *path, size_t sz) {
  if (out != dir) strlcpy_retro__(out, dir, sz);
  if (*out) {
    char last = out[strlen(out) - 1];
    if (last != '/' && last != '\\') strlcat_retro__(out, "/", sz);
  }
  strlcat_retro__(out, path, sz);
}
W void fill_pathname_resolve_relative(char *out, const char *dir, const char *path, size_t sz) {
  if (path_is_absolute(path)) strlcpy_retro__(out, path, sz);
  else fill_pathname_join(out, dir, path, sz);
}
/* ── Directory ── */
struct RDIR { DIR *d; struct dirent *e; };
W struct RDIR *retro_opendir_include_hidden(const char *name, bool ih) {
  DIR *d = opendir(name);
  if (!d) return NULL;
  struct RDIR *r = malloc(sizeof(*r));
  r->d = d; r->e = NULL;
  return r;
}
W bool retro_readdir(struct RDIR *r)                      { return r && (r->e = readdir(r->d)); }
W bool retro_dirent_is_dir(struct RDIR *r, const char *p) {
  if (!r || !r->e) return false;
  if (r->e->d_type == DT_DIR) return true;
  char fp[1024]; snprintf(fp, sizeof(fp), "%s/%s", p, r->e->d_name);
  struct stat st; return stat(fp, &st) == 0 && S_ISDIR(st.st_mode);
}
W void retro_closedir(struct RDIR *r) { if (r) { closedir(r->d); free(r); } }
/* ── File mode ── */
static const char *vfs_mode(unsigned m) {
  if (m & RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING) return "r+b";
  if ((m & RETRO_VFS_FILE_ACCESS_READ_WRITE) == RETRO_VFS_FILE_ACCESS_READ_WRITE) return "w+b";
  if (m & RETRO_VFS_FILE_ACCESS_WRITE) return "wb";
  return "rb";
}
/* ── Filestream ── */
W void   *filestream_open (const char *p, unsigned m, unsigned h) { return fopen(p, vfs_mode(m)); }
W int64_t filestream_read (void *s, void *d, int64_t n)          { return (int64_t)fread(d, 1, (size_t)n, s); }
W int64_t filestream_write(void *s, const void *d, int64_t n)    { return (int64_t)fwrite(d, 1, (size_t)n, s); }
W char   *filestream_gets (void *s, char *b, size_t n)           { return fgets(b, (int)n, s); }
W int     filestream_eof  (void *s)                              { return feof(s); }
W int     filestream_getc (void *s)                              { return fgetc(s); }
W int     filestream_error(void *s)                              { return ferror(s); }
W void    filestream_vfs_init(void)                              { }
W int64_t filestream_tell (void *s)                              { return (int64_t)ftello(s); }
W int     filestream_close(void *s)                              { return s ? fclose(s) : -1; }
W int64_t filestream_seek (void *s, int64_t off, int wh) {
  return fseeko(s, off, wh) == 0 ? ftello(s) : -1;
}
W int64_t filestream_read_file(const char *path, void **buf, int64_t *len) {
  FILE *fp = fopen(path, "rb");
  if (!fp) return 0;
  fseeko(fp, 0, SEEK_END);
  int64_t sz = ftello(fp);
  fseeko(fp, 0, SEEK_SET);
  void *d = malloc(sz);
  if (!d) { fclose(fp); return 0; }
  if (fread(d, 1, sz, fp) != (size_t)sz) { free(d); fclose(fp); return 0; }
  fclose(fp);
  *buf = d; *len = sz;
  return 1;
}
W int64_t filestream_get_size(void *s) {
  if (!s) return 0;
  int64_t c = ftello(s); fseeko(s, 0, SEEK_END);
  int64_t sz = ftello(s); fseeko(s, c, SEEK_SET);
  return sz;
}
/* ── VFS handle ── */
struct retro_vfs_file_handle { FILE *fp; };
W struct retro_vfs_file_handle *retro_vfs_file_open_impl(const char *p, unsigned m, unsigned h) {
  FILE *fp = fopen(p, vfs_mode(m));
  if (!fp) return NULL;
  struct retro_vfs_file_handle *v = malloc(sizeof(*v));
  v->fp = fp; return v;
}
W int     retro_vfs_file_close_impl   (struct retro_vfs_file_handle *s) { if (s) { fclose(s->fp); free(s); } return 0; }
W int64_t retro_vfs_file_get_size_impl(struct retro_vfs_file_handle *s) { return filestream_get_size(s ? s->fp : NULL); }
W int64_t retro_vfs_file_read_impl    (struct retro_vfs_file_handle *s, void *d, int64_t n)       { return s ? (int64_t)fread(d, 1, (size_t)n, s->fp)  : -1; }
W int64_t retro_vfs_file_write_impl   (struct retro_vfs_file_handle *s, const void *d, int64_t n) { return s ? (int64_t)fwrite(d, 1, (size_t)n, s->fp) : -1; }
W int64_t retro_vfs_file_tell_impl    (struct retro_vfs_file_handle *s) { return s ? (int64_t)ftello(s->fp) : -1; }
W int64_t retro_vfs_file_seek_impl    (struct retro_vfs_file_handle *s, int64_t off, int wh) {
  return s && fseeko(s->fp, off, wh) == 0 ? ftello(s->fp) : -1;
}