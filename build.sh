OUT_DIR="docs"
EXCLUDE_LIST=(".git" ".agent" ".vscode" ".github" "build.sh" "station" "$OUT_DIR")
if [ -f "sw.js" ]; then
    perl -i -pe "s/EmuX_(\d+\.\d+)/\"EmuX_\" . sprintf('%.2f', \$1 + 0.01)/e" sw.js
    VERSIONS=$(grep -o "EmuX_[0-9.]*" sw.js)
fi
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
EXCLUDE_ARGS=""
for item in "${EXCLUDE_LIST[@]}"; do EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$item"; done
rsync -av $EXCLUDE_ARGS ./ "$OUT_DIR/"
find "$OUT_DIR" -type f -name "*.js" | while read -r file; do
    sed -i '' -E 's/([^:])\/\/.*$/\1/g' "$file"
    sed -i '' -E 's/^\/\/.*$//g' "$file"
    tr -d '\n\r' < "$file" | sed 's/[[:space:]]\{2,\}/ /g' > "$file.tmp"
    mv "$file.tmp" "$file"
done
find "$OUT_DIR" -type f -name "*.css" | while read -r file; do
    perl -0777 -i -pe 's/\/\*.*?\*\///sg' "$file"
    tr -d '\n\r' < "$file" | sed 's/[[:space:]]\{2,\}/ /g' > "$file.tmp"
    mv "$file.tmp" "$file"
done
find "$OUT_DIR" -type f -name "*.html" | while read -r file; do
    perl -0777 -i -pe 's/<!--.*?-->//sg' "$file"
    tr -d '\n\r' < "$file" | sed 's/[[:space:]]\{2,\}/ /g' > "$file.tmp"
    mv "$file.tmp" "$file"
done
clear
echo "╔═══════════════════════╗"
echo "║ -- Build $VERSIONS -- ║"
echo "╚═══════════════════════╝"