---
description: Tự động gom code, viết commit message chuẩn chuyên nghiệp và đẩy lên GitHub
---

// turbo-all
Để thực hiện việc này, tôi sẽ:
1. Chạy `git add .` để gom tất cả thay đổi.
2. Tự động soi `git diff --cached` để hiểu nội dung sửa đổi.
3. Thiết kế Commit Message chuẩn **Conventional Commits**:
   - Title: `<type>(<scope>): <description>`
   - Body: Các gạch đầu dòng chi tiết (`- ...`).
4. Thực hiện lệnh:
   - `git commit -m "Tiêu đề" -m "Nội dung chi tiết"`
   - `git push`
