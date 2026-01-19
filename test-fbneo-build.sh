#!/bin/bash
set -e

echo "=== FBNeo Local Build Test ==="
echo "This script will build FBNeo locally to verify the workflow"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if emsdk is installed
if [ ! -d "$HOME/emsdk" ]; then
    echo -e "${YELLOW}Installing Emscripten SDK...${NC}"
    cd ~
    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk
    ./emsdk install 3.1.74
    ./emsdk activate 3.1.74
else
    echo -e "${GREEN}✓ Emscripten SDK found${NC}"
    cd ~/emsdk
    ./emsdk activate 3.1.74
fi

# Source emsdk environment
source ~/emsdk/emsdk_env.sh

# Verify emcc
echo ""
echo "Emscripten version:"
emcc --version

# Clone FBNeo if not exists
cd /tmp
if [ -d "FBNeo" ]; then
    echo -e "${YELLOW}Removing old FBNeo clone...${NC}"
    rm -rf FBNeo
fi

echo ""
echo -e "${YELLOW}Cloning FBNeo...${NC}"
git clone --depth 1 https://github.com/libretro/FBNeo.git

# Build
cd FBNeo/src/burner/libretro

echo ""
echo -e "${YELLOW}Building FBNeo core...${NC}"
emmake make -f Makefile platform=emscripten -j$(sysctl -n hw.ncpu)

# Find the output file
if [ -f "fbneo_libretro_emscripten.bc" ]; then
    CORE_FILE="fbneo_libretro_emscripten.bc"
    echo -e "${GREEN}✓ Found bitcode: $CORE_FILE${NC}"
elif [ -f "fbneo_libretro_emscripten.a" ]; then
    CORE_FILE="fbneo_libretro_emscripten.a"
    echo -e "${GREEN}✓ Found archive: $CORE_FILE${NC}"
else
    echo -e "${RED}✗ FAILED: No output file created${NC}"
    ls -la fbneo_libretro_emscripten.* 2>/dev/null || echo "No files found"
    exit 1
fi

# Link to WASM
echo ""
echo -e "${YELLOW}Linking to WASM...${NC}"
emcc \
"$CORE_FILE" \
-O3 \
-s WASM=1 \
-s USE_ZLIB=1 \
-s ALLOW_MEMORY_GROWTH=1 \
-s INITIAL_MEMORY=268435456 \
-s ENVIRONMENT=web \
-s MODULARIZE=0 \
-s EXPORT_NAME="Module" \
-s FORCE_FILESYSTEM=1 \
-s EXPORTED_RUNTIME_METHODS='["addFunction","FS","stringToUTF8","ccall","cwrap"]' \
-s EXPORTED_FUNCTIONS='["_retro_init","_retro_deinit","_retro_run","_retro_load_game","_retro_unload_game","_retro_set_environment","_retro_set_video_refresh","_retro_set_audio_sample","_retro_set_audio_sample_batch","_retro_set_input_poll","_retro_set_input_state","_retro_get_system_av_info","_malloc","_free"]' \
-s ALLOW_TABLE_GROWTH=1 \
-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
-s ASSERTIONS=1 \
-o /tmp/fbneo_libretro.js

echo ""
echo -e "${YELLOW}Verifying build...${NC}"

# Check files exist
if [ ! -f "/tmp/fbneo_libretro.js" ] || [ ! -f "/tmp/fbneo_libretro.wasm" ]; then
    echo -e "${RED}✗ FAILED: Output files not created${NC}"
    exit 1
fi

# Check for dynCall_iii
if grep -q "dynCall_iii" /tmp/fbneo_libretro.js; then
    echo -e "${GREEN}✓ SUCCESS: Found dynCall_iii (standard 32-bit ABI)${NC}"
else
    echo -e "${RED}✗ FAILURE: dynCall_iii not found${NC}"
    echo "Available dynCall signatures:"
    grep -o "dynCall_[a-z]*" /tmp/fbneo_libretro.js | sort | uniq
    exit 1
fi

# Show file sizes
echo ""
echo "=== Build Results ==="
ls -lh /tmp/fbneo_libretro.* | awk '{print $5, $9}'

echo ""
echo -e "${GREEN}=== BUILD SUCCESSFUL ===${NC}"
echo ""
echo "Files created at:"
echo "  /tmp/fbneo_libretro.js"
echo "  /tmp/fbneo_libretro.wasm"
echo ""
echo "To copy to your project:"
echo "  cp /tmp/fbneo_libretro.* ~/Documents/GitHub/Emux/src/core/"
