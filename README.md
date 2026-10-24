# Picky — as picky as you are

Picky 从你的 A/B 选择中学习，在自己的肖像照片里推荐你更喜欢的那几张。VLM 提取可见属性，本地个人排序器学习偏好；VLM 权重不更新。

## 当前状态

- Today / Your call / Your taste 页面、当天相册读取、时间分组、前台新照片检测和本地提醒已实现。
- 手机默认使用个人 pairwise ranker，偏好和已处理照片 ID 保存到设备，重新挑选和重启保留；损坏的主快照可恢复到上一份备份。Reset 清空两份快照。
- 手机 API 和真人实验使用相同的固定属性、VLM 提示词和响应校验。允许小数、并列和 null；不强行把每批最好/最差拉成 5/1。
- 原图保留在手机上。`binned` 表示未推荐；当前没有 Drive 备份，也没有删除操作。
- 真人盲选实验、训练/测试场景隔离、学习曲线和冻结的旧计数器基线已实现。
- 27 项回归测试、完整类型检查、lint、Web/server 导出和 iOS JS 导出已通过。本次未运行付费 VLM 请求或 iPhone 真机测试；没有真人准确率结论。

## 启动手机应用

使用 Node 24：

```bash
npm ci
```

在本地根目录 `.env` 填写，勿提交：

```dotenv
ANTHROPIC_API_KEY=your-key
# 可选：改成该 key 实际可用的视觉模型；默认沿用项目的 claude-opus-5-5
ANTHROPIC_MODEL=claude-opus-5-5
MAX_VLM_CALLS=60
```

```bash
npx expo start --tunnel
```

iPhone 需允许照片权限，建议准备 `Picky Demo` 相册，放当天拍摄的单人照。若相册不存在，现有流程会从当天照片创建它。每次最多处理 120 张，每组最多 12 张，拍摄时间相隔超过 5 分钟另起一组。照片会发送到 Anthropic 进行视觉分析；原图保留。

手机默认真实数据，Web 默认 mock；`EXPO_PUBLIC_USE_MOCK=1` 可在手机使用 mock。开发时 API 使用 Expo 的开发服务器，校园 Wi-Fi 受限可用 tunnel。安装包上线还需独立部署 API 并配置服务 origin。

新照片检测发生在打开应用、回到前台或应用运行期间相册变化时；demo 默认 1 分钟无新照片后开始。`EXPO_PUBLIC_IDLE_MINUTES=60` 可改为 60 分钟。后台是预约提醒，不保证 iOS 在后台执行完整选片。失败运行不推进处理检查点，可以修复网络/配置后再试。

## 进行真实用户实验

```bash
npm run experiment:real
```

打开 http://127.0.0.1:3002 ，按页面创建并选择以下目录：

```text
PickyStudy/
  train/session-01/  （本次拍摄的 3–6 张相似照片）
  train/session-02/
  test/session-11/   （独立拍摄会话）
  test/session-12/
```

建议 train / test 各至少 5 个独立场景；同一连拍不得跨两侧。每人固定一个选片用途，选择 A/B、明确无偏好或跳过。完成前隐藏模型答案，完成后展示新旧方法、0/5/10/20/40 条反馈的测试效果及重复选择一致率。可选额外一次 VLM 请求检查评分稳定性。

图片预览留在浏览器；特征、哈希和真人选择自动保存在忽略的 `server/runs/`，也可下载 JSON。没有真实标签时，不把模拟数字当产品准确率。刷新页面暂不能继续未完成的图片预览流程。

详细协议、字段及限制见 [server/README.md](server/README.md)，模拟压力实验见 [server/EXPERIMENTS.md](server/EXPERIMENTS.md)。

## 验证

```bash
npm run test:preferences
npm run lint
npm run lint:backend
npm run typecheck
npx expo export --platform web
npx expo export --platform ios --output-dir dist-ios
```

测试使用明确标记的 provider fixtures，不产生付费请求。真实 VLM、相册权限、本地通知、端到端拍照流程仍须真机验收。

## 代码位置

- `src/lib/use-picky.tsx`：真实数据流程、持久化、取消和处理检查点。
- `src/lib/personalization/`：固定属性、个人排序器和非破坏性推荐引擎。
- `src/lib/preferences.ts` / `scoring.ts`：快照格式、跨轮保留和响应校验。
- `src/app/api/select+api.ts` / `server/vision.ts`：共用的 VLM 请求、内容缓存、超时和调用上限。
- `server/study.ts` / `real-experiment.ts`：真实标签收集和独立测试。
- `server/baseline.ts`：冻结于 `main@23f2b9f` 的旧计数器，避免比较时误用同一个新模型。

仍待完成：真人效果评估、自动人脸局部图、按用途区分的个人档案、完整后台调度、Drive 备份和生产部署。当前是单用户单用途的线性模型；概率未校准，矛盾选择不等于用户不在乎。
