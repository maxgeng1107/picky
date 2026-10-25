# Picky — as picky as you are

Picky 从你的 A/B 选择中学习，在自己的肖像照片里推荐你更喜欢的那几张。现有手机计数器从 A/B 选择积累偏好；独立实验工具比较新的个人排序器。VLM 权重不更新。

## 当前状态

- Today / Your call / Your taste 页面、当天相册读取、时间分组、前台新照片检测和本地提醒已实现。
- 默认保留 main@b701981 的计数器、通用分数、VLM 提示词和 512px 评分输入；没有证据证明新排序器更准，所以不替换默认行为。
- 保留 Drive JPEG 备份与空间释放；缺少配置、上传失败、内容校验失败或用户取消时不删除。确认过的 JPEG 副本不等同于原始 HEIC/Live Photo 完整备份。
- 保留偏好/已处理资产 ID 的设备持久化和损坏恢复、严格评分响应校验、内容缓存、超时、调用上限、旧点击防护及类型/lint 修复。
- 新个人排序器和固定锚点评分仅用于真人盲选实验，默认手机仍用现有流程。
- 39 项测试覆盖，包括 100 轮相同输入下默认计数器与旧版一致，以及备份失败/取消不删。真机、真实 Google/Anthropic 调用和真人准确率尚未验收。

详细取舍见 [server/DECISIONS.md](server/DECISIONS.md)。

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

iPhone 需允许照片权限。保留现有主分支行为：自动检测当天整个相机胶卷，并同步到 `Picky Demo` 相册后选片。每次最多处理 300 张，每组最多 12 张，拍摄时间相隔超过 5 分钟另起一组。照片会发送到 Anthropic 进行视觉分析；原图保留。

保留手机内的选片标记与学习曲线，但明确显示为练习集命中率：包含参与学习的场景，不能作为未见照片上的准确率证据。重新处理时按照片 ID 迁移标记，避免场景编号变化造成错配。

手机默认真实数据，Web 默认 mock；`EXPO_PUBLIC_USE_MOCK=1` 可在手机使用 mock。开发时 API 使用 Expo 的开发服务器，校园 Wi-Fi 受限可用 tunnel。安装包上线还需独立部署 API 并配置服务 origin。

Drive 备份需要在同一服务端 `.env` 配置 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REFRESH_TOKEN`（使用 drive.file 范围）。这是配置账号的演示服务，不是多用户 OAuth 登录；不要直接公开部署。

“Back up & free space”会先说明 JPEG 转换限制，再在每张上传被 Drive 确认且校验通过后请求系统删除。未配置 Drive 不提供直接删除 fallback。30 天 expiresAt 只是标签，自动清理尚未实现。

新照片检测发生在打开应用、回到前台或应用运行期间相册变化时；demo 默认 1 分钟无新照片后开始。`EXPO_PUBLIC_IDLE_MINUTES=60` 可改为 60 分钟。后台是预约提醒，不保证 iOS 在后台执行完整选片。每组最多尝试两次，失败组不推进处理检查点、不会进入删除建议；成功组仍可完成，可以修复网络/配置后再试失败组。

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
- `src/lib/taste.ts`：现有默认计数器/选片规则；`personalization/`：仅实验的新排序器。
- `src/lib/preferences.ts` / `scoring.ts`：快照格式、跨轮保留和响应校验。
- `server/legacy-vision.ts`：保留现有手机提示词，补校验/缓存/限流；`server/vision.ts`：固定锚点实验评分。
- `server/drive.ts` / `src/lib/backup.ts`：可重用 JPEG 备份、校验确认和仅删除已确认照片的执行逻辑。
- `server/study.ts` / `real-experiment.ts`：真实标签收集和独立测试。
- `server/baseline.ts`：冻结于 `main@23f2b9f` 的旧计数器，避免比较时误用同一个新模型。

仍待完成：真人效果评估、自动人脸局部图、按用途区分的个人档案、完整后台调度、多用户 Drive 授权及生产部署。实验模型是单用户单用途的线性模型，概率未校准；混合选择不等于用户不在乎。
