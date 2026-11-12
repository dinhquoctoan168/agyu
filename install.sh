#!/usr/bin/env bash
set -e

# Resolve repository root
SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo "=========================================="
echo "   Cài đặt Antigravity Desktop UI (agyu)  "
echo "=========================================="

# 1. Cấp quyền thực thi cho các script trong dự án
echo "[1/4] Cấp quyền thực thi..."
chmod +x "$PROJECT_ROOT/bin/agyu"
chmod +x "$PROJECT_ROOT/bin/agy-account" 2>/dev/null || true
if [ -f "$PROJECT_ROOT/app/guardrail_hook.py" ]; then
    chmod +x "$PROJECT_ROOT/app/guardrail_hook.py"
fi

# 2. Tạo symlink agyu vào ~/.local/bin
echo "[2/4] Tạo symlink vào ~/.local/bin..."
mkdir -p "$HOME/.local/bin"
TARGET_LINK="$HOME/.local/bin/agyu"

if [ -L "$TARGET_LINK" ] || [ -f "$TARGET_LINK" ]; then
    rm -f "$TARGET_LINK"
fi
ln -s "$PROJECT_ROOT/bin/agyu" "$TARGET_LINK"
echo "  -> Đã liên kết: $TARGET_LINK -> $PROJECT_ROOT/bin/agyu"

# 3. Đồng bộ file quy tắc GEMINI.md toàn cục
echo "[3/4] Thiết lập quy tắc Antigravity (GEMINI.md)..."
GEMINI_GLOBAL_DIR="$HOME/.gemini"
mkdir -p "$GEMINI_GLOBAL_DIR"

if [ -f "$PROJECT_ROOT/GEMINI.md" ]; then
    if [ ! -f "$GEMINI_GLOBAL_DIR/GEMINI.md" ]; then
        cp "$PROJECT_ROOT/GEMINI.md" "$GEMINI_GLOBAL_DIR/GEMINI.md"
        echo "  -> Đã tạo mới: $GEMINI_GLOBAL_DIR/GEMINI.md"
    else
        echo "  -> Đã có sẵn $GEMINI_GLOBAL_DIR/GEMINI.md (bỏ qua để giữ cấu hình hiện tại)."
    fi
fi

# 4. Kiểm tra PATH
echo "[4/4] Kiểm tra biến môi trường PATH..."
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "  LƯU Ý: Thư mục ~/.local/bin chưa nằm trong biến môi trường PATH."
    echo "  Hãy thêm dòng sau vào ~/.bashrc hoặc ~/.zshrc:"
    echo '    export PATH="$HOME/.local/bin:$PATH"'
fi

echo ""
echo " Hoàn tất cài đặt!"
echo "Bạn có thể gõ 'agyu' tại bất kỳ thư mục dự án nào để mở ứng dụng."
