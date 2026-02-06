---
description: Nhét code mới vào commit cuối cùng và đẩy đè lên GitHub (Force Push)
---

// turbo-all
Để thực hiện việc này, tôi sẽ:
1. Chạy `git add .` để gom code mới sửa.
2. Thực hiện lệnh "gộp" vào commit cũ:
   - `git commit --amend --no-edit` (Giữ nguyên message cũ nhưng nhét code mới vào).
3. Đẩy đè lên GitHub:
   - `git push --force-with-lease` (An toàn hơn --force thông thường).
