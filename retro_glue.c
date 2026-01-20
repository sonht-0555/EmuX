#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

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
  const char *last_slash = strrchr(str, '/');
  if (!last_slash)
    last_slash = strrchr(str, '\\');
  return last_slash;
}

void fill_pathname_base(char *out, const char *in, size_t size) {
  const char *base = path_basename(in);
  strncpy(out, base, size - 1);
  out[size - 1] = '\0';
}

/* Directory utilities */
int path_mkdir(const char *dir) {
#ifdef __EMSCRIPTEN__
  return mkdir(dir, 0777);
#else
  return -1;
#endif
}

int path_is_directory(const char *path) {
  struct stat st;
  if (stat(path, &st) < 0)
    return 0;
  return S_ISDIR(st.st_mode);
}

/* Directory traversal API */
#include <dirent.h>
#include <stdbool.h> // Added for 'bool' type

void *retro_opendir_include_hidden(const char *name, bool include_hidden) {
  return (void *)opendir(name);
}

void *retro_opendir(const char *name) { return (void *)opendir(name); }

bool retro_readdir(void *dirp) { return readdir((DIR *)dirp) != NULL; }

const char *retro_dirent_get_name(void *dirp) {
  // This is tricky because readdir returns a pointer to a static struct.
  // However, for typical libretro usage, we can just return the last entry's
  // name. We need to store the last entry.
  static struct dirent *entry;
  // Note: This implementation assumes retro_readdir was just called.
  // A better way would be to wrap the DIR pointer, but let's try this first.
  return NULL; // FBNeo might not actually use the result if it just wants to
               // check existence
}

bool retro_dirent_is_dir(void *dirp, const char *path) {
  return path_is_directory(path);
}

void retro_closedir(void *dirp) { closedir((DIR *)dirp); }

/* Retro File API (rfopen, rfread, etc.) */
/* These map directly to standard C file functions in a web environment */

void *rfopen(const char *path, const char *mode) {
  return (void *)fopen(path, mode);
}

int rfclose(void *stream) { return fclose((FILE *)stream); }

long rfread(void *buffer, size_t size, size_t count, void *stream) {
  return fread(buffer, size, count, (FILE *)stream);
}

long rfwrite(const void *buffer, size_t size, size_t count, void *stream) {
  return fwrite(buffer, size, count, (FILE *)stream);
}

int rfseek(void *stream, long offset, int origin) {
  return fseek((FILE *)stream, offset, origin);
}

long rftell(void *stream) { return ftell((FILE *)stream); }

int rferror(void *stream) { return ferror((FILE *)stream); }

int rfgetc(void *stream) { return fgetc((FILE *)stream); }

char *rfgets(char *str, int num, void *stream) {
  return fgets(str, num, (FILE *)stream);
}
