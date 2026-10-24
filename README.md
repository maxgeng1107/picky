 Picky — as picky as you are

c0mpiled-16 hackathon · Track 4: AI-Powered Consumer Products for 1 Billion People

每晚自动整理当天的自拍：每个场景留下**你自己**会选的那一两张（值得 P、值得发的），其余备份到 Google Drive 的 Cloud Bin 并释放手机空间。拿不准时才发通知问你一次 A vs B，从你的选择里学会你真正在意什么（比如「显脸小」，而不是「角度」）。

**原则：Claude 负责打分，代码负责计数。** Claude（视觉模型）每个场景调用一次，给照片在固定的维度上打 1–5 分；学习和挑选都是本地代码，所以每次回答 A vs B 后面板都是即时更新的。

> 最后更新：10/24 15:30 · 截止提交 18:30（18:10 前交）

---

## 当前进度

| 部分 | 状态 | 负责人 |
|---|---|---|
| 项目骨架（Expo SDK 58、expo-router、TypeScript） | ✅ 完成 | Max |
| 依赖：`expo-media-library`、`expo-image-manipulator`、`expo-notifications` | ✅ 已装 | Max |
| 共享接口 `src/lib/types.ts` | ✅ 初版（按计划 v3 的接口约定） | Lingge 负责后续修改 |
| 模拟数据 `src/mock/picky-mock.tsx`（含分差学习、每个场景留 1–3 张、按场景重新排序、复习流程） | ✅ 完成 | Max |
| **Today** 页：场景卡片、通用 app vs Picky 对比、Cloud Bin、Free up、Simulate tonight | ✅ 完成 | Max |
| **Your call** 页：A vs B、四个按钮、各维度分数对比、「Learned: …」提示 | ✅ 完成 | Max |
| **Your taste** 页：证据条、状态标签、总结句、Reset | ✅ 完成 | Max |
| 本地通知（模拟夜间整理 5 秒后弹出，点开进入 Your call） | ✅ 已写 · ⏳ 待在 iPhone 上确认 | Max |
| 在 iPhone 上用 Expo Go 跑通 | ✅ 通过 `--tunnel` 能打开（校园 Wi-Fi 会挡住局域网连接） | — |
| `server/`：`/health`、`/api/select`（Claude）、缓存 | ❌ 未开始（提议由 Max 来做，待 Lingge 确认） | 待定 |
| `src/lib/`：读相册、分场景、压缩图片、调服务器、真实 `usePicky` | ❌ 未开始 | Lingge |
| Google Drive 上传 + 删除 | ❌ 建议先砍，16:15 后有余力再补 | 待定 |
| demo 照片（相册 **Picky Demo**） | ❌ 未拍 | Max |

**下一个检查点：** 15:40 B（把模拟数据换成真实数据）→ 16:15 C（学习流程在手机上跑通）→ **16:45 停止加功能**

---

## 怎么跑起来

```bash
git clone https://github.com/maxgeng1107/picky.git
cd picky
npm install
npx expo start --tunnel   # 校园 Wi-Fi 下用 --tunnel；连同一个热点时用 npx expo start 就行
```

用 iPhone 相机扫终端里的二维码，在 Expo Go 里打开。

演示流程：**Today → Simulate tonight**（允许通知，5 秒内回到桌面）→ 点通知 → **Your call** 依次选「B replaces A」→「Keep A」→「B replaces A」→ **Your taste** 显示「face looks smaller：Confident 3/0」「facing the camera：Doesn't care」→ 回到 **Today**，第 3 个场景显示「A generic app keeps」vs「Picky keeps」。

Taste 页底部的 **Reset** 可以重新开始演示。

---

## 目录和分工

**每个人只改自己的文件夹，这样 git 不会冲突。** 规则写在 [`AGENTS.md`](AGENTS.md) 里，Claude Code 和 Codex 都会自动读取。

```
src/
  app/                 Max     页面（每个文件就是一个路由）
    _layout.tsx                 Provider、通知点击 → Your call
    index.tsx                   Today
    review.tsx                  Your call（A vs B）
    taste.tsx                   Your taste
  components/          Max     app-tabs、picky/ui、picky/scene-card
  constants/picky.ts   Max     颜色、状态文字
  hooks/use-picky.ts   Max     ⭐ 唯一切换点：现在指向 mock，接入时改成 src/lib
  mock/picky-mock.tsx  Max     模拟版 usePicky()，真实实现以它为参考
  lib/                 Lingge  types.ts（共享接口）+ 真实逻辑
server/                待定    Express + Claude + Drive（还不存在）
docs/backend-spec.md           后端规格：API、prompt、维度、学习规则、Drive
docs/handoff.md                交接总结：最新决定、待确认事项、下一步
```

- 只有 Lingge 改 `src/lib/types.ts` 和装依赖，需要的话先说一声。
- 每次 push 前：`git status`（确认没有 `.env`）→ `git pull --rebase` → `git push`。不要 `--force`。
- 密钥只放在 `server/.env`（已在 `.gitignore` 里）。

---

## 接入真实数据（检查点 B）

`src/lib/use-picky.tsx` 要导出 `PickyProvider` 组件和 `usePicky()` hook，返回值 `{ state, actions }` 的结构和 mock 完全一样（见 `src/lib/types.ts`）。写好以后，只改一行：

```ts
// src/hooks/use-picky.ts
export { PickyProvider, usePicky } from '@/lib/use-picky';
```

注意：`review.index` 从 0 开始；`answer()` 是同步更新 profile 的（不调 LLM）。

---

## 偏好列表（Claude 打分的维度）

| key | 显示名 | 类型 |
|---|---|---|
| `face_small` | face looks smaller | 美感 |
| `jawline` | clean jawline | 美感 |
| `big_eyes` | eyes look bigger | 美感 |
| `facing_camera` | facing the camera | 风格（没有好坏） |
| `smile_teeth` | big smile with teeth | 风格 |
| `camera_high` | shot from slightly above | 风格 |
| `lighting`、`expression` | 参与打分，不在面板上显示 | 美感 |

每个维度怎么打分、学习规则（`DIFF_MIN = 2`）和状态判断见 [`docs/backend-spec.md`](docs/backend-spec.md)。

---

## 已知问题

- 校园 Wi-Fi 会挡住手机直连电脑，请用 `--tunnel` 或两台设备都连热点。
- Expo Go 会提示 expo-notifications 的警告：那是关于 Android 远程推送的，我们只用 iOS 本地通知，可以忽略。
- mock 里的照片是随机风景图，只是占位，接入真实相册后会被替换。
- `npx tsc --noEmit` 会报 1 个错误，在模板自带的网页版 tab 按钮里（`src/components/app-tabs.web.tsx`）。只影响网页版的类型检查，不影响 iPhone 运行。
