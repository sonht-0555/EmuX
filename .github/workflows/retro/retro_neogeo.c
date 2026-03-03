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
W int64_t filestream_tell (void *s)                              { return (int64_t)ftello(s); }
W int     filestream_close(void *s)                              { return s ? fclose(s) : -1; }
W int64_t filestream_seek (void *s, int64_t off, int wh) {
  return fseeko(s, off, wh) == 0 ? ftello(s) : -1;
}
W int64_t filestream_get_size(void *s) {
  if (!s) return 0;
  int64_t c = ftello(s); fseeko(s, 0, SEEK_END);
  int64_t sz = ftello(s); fseeko(s, c, SEEK_SET);
  return sz;
}
/* ── rf* aliases ── */
W void   *rfopen (const char *p, const char *m)                   { return fopen(p, m); }
W int64_t rfread (void *b, size_t sz, size_t n, void *s)          { return (int64_t)fread(b, sz, n, s); }
W int64_t rfwrite(const void *b, size_t sz, size_t n, void *s)    { return (int64_t)fwrite(b, sz, n, s); }
W int64_t rfseek (void *s, int64_t off, int o)                    { return (int64_t)fseeko(s, off, o); }
W int64_t rftell (void *s)                                        { return (int64_t)ftello(s); }
W int     rfclose(void *s)                                        { return s ? fclose(s) : -1; }
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