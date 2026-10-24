# Picky 第一版：固定 VLM + 个人成对偏好模型

VLM 仅提取可见属性，不推断用户喜欢哪张。用户的明确二选一在本地训练带 L2 正则的 pairwise logistic ranker，VLM 权重不更新。这不是 VLM pretraining，也不是 RL。手机已默认接入，尚未完成真机和真人准确率验收。

## 接入状态

手机默认使用个人 pairwise ranker；无需额外环境开关，也不再维护两套手机 provider。偏好和已处理资产 ID 存在设备，下一轮和重启保留；有上一份快照恢复机制。UI hook 保持手机真实 / web mock 的切换。

手机 `src/app/api/select+api.ts` 和本地真人实验共用 `server/vision.ts` 的提示词、校验、缓存、超时和调用上限。原图保持不动，删除操作禁用。实验结果的 `currentMainCounterAccuracy` 字段指冻结的 `main@23f2b9f` 旧基线，并非这次升级后的手机引擎。

## 直接做真人实验（无需先接手机）

1. 在根目录现有 `.env` 保留 Max 的 `ANTHROPIC_API_KEY`，再加 `ANTHROPIC_MODEL=claude-opus-5-5`（或你账号实际可用的视觉模型 ID）。服务也支持 `LLM_API_KEY` / `server/.env`。不要把 key 发到聊天或提交 Git。
2. `npm ci` 后执行 `npm run experiment:real`，浏览器打开 `http://127.0.0.1:3002`。这个实验工具仅监听本机。
3. 用自己的单人照片建目录 `PickyStudy/train/session-01/*.jpg` 和 `PickyStudy/test/session-11/*.jpg`。同一次拍摄会话不能跨 train/test，场景名全局唯一。建议两侧各至少 5 个场景，每场景 3–6 张相似照片；也支持 PNG/WebP，HEIC 需先导出 JPEG。
4. 输入参与者代号和固定用途，选最外层目录，勾选图片发送说明，再开始。每个场景一次真实 VLM 调用；失败会报错。最多 24 个场景、120 张图。
5. 随机抽取每场景最多 5 对图，训练最多 40 对、测试最多 60 对。完成所有 A/B、平局或跳过选择后才显示准确率。额外交换位置重复最多 5 对，测用户一致性，重复题不参与学习或准确率。
6. 结果比较同样特征下冻结于 main@23f2b9f 的旧计数器和新排序器，报告 0/5/10/20/40 条反馈的学习曲线、VLM 观测细微子集、Brier、log loss、探索性按场景 bootstrap 区间。少于 3 个有明确偏好的独立测试场景时不输出区间。标签不是独立同分布，样本很少的数值只能作为 pilot。
7. 勾选可选稳定性检查，会对首个场景交换顺序、绕过缓存再调用一次，导出均分变化/最大变化/null 差异/gate 翻转。它同时改变调用和顺序，只是诊断，不能分别归因。
8. 数据自动存 `server/runs/study-*.json`（已 gitignore），也可点页面下载。只有哈希、特征、选择和报告，不存图片字节或 key。重复图片按编码 JPEG 哈希拒绝，但改图/重编码的近重复仍需人工按会话分开。刷新页面不能恢复尚未完成的图片预览和标注流程，已保存标签仍在本地。

这是实际 API + 人工选择工作流。没有真实照片、模型凭据和真人标签时，只能验证 fixture 协议，不能产生真人准确率。每位参与者单独运行并固定用途，先少量 pilot 跑通，再让 5–10 人各做一轮。应先对照一致率、特征稳定性和近重复子集判断瓶颈，再决定增加特征或改模型。

## 本地运行

要求 Node 22.13+，本次验证 Node 24.22.1。

```bash
npm ci
npm run test:preferences
npm run typecheck:backend
npm run lint:backend
npm run experiment:preferences
```

在忽略的 `server/.env` 中本地填写（不要提交或把密钥放到移动端）：

```dotenv
LLM_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=your-enabled-vision-model-id
HOST=0.0.0.0
PORT=3001
MAX_VLM_CALLS=60
```

默认只监听 127.0.0.1；上面的 HOST 用于受信任局域网真机演示。服务没有用户认证、TLS 或多租户隔离，不要直接公开部署。浏览器 Origin 请求被拒绝。每进程最多 60 次 VLM 请求（失败也计数），串行请求，60 秒超时，无自动重试；这是调用次数上限，不是美元费用上限，重启会重置。建议同时在供应商后台设置消费限额。

```bash
npm run server
```

手机应用只需根目录 `.env` 的服务端 key，由 Expo API route 提供评分，运行 `npx expo start --tunnel`。无需 EXPO_PUBLIC_PERSONAL_RANKER 或 EXPO_PUBLIC_API_URL。最多 120 张当天肖像，每个场景最多 12 张。图片发送 Anthropic 提取属性；本地只保存个人模型/比较特征和资产 ID，原图不删除。

`npm run server` 仍提供一个可选的 3001 端口兼容接口，返回 scores/gated/ranking；它用于脚本实验，不是手机 API 的部署替代品。真人实验工具用 `npm run experiment:real`，端口 3002，UI 收集真实标签；两者不要混淆。

## 实现边界

- 8 个固定属性定义在 `src/lib/personalization/features.ts`。允许并列、小数及 null，禁止每批强行把最好/最差拉到 5/1。`face_small` 指脸部轮廓，不把拍远了当脸更瘦。
- 只有 keepA / replace 训练。keepBoth / skip 不代表审美相等，不训练。矛盾反馈不再被称为“你不在乎”；相同图片对覆盖旧反馈而不是重复加权。
- 最多保留 300 条比较，特征版本不匹配则重置。用户偏好、特征和图片 ID 存在设备本地，不存图片内容；有损坏恢复快照，不做账户同步。
- 单个用户、单个用途的线性偏好模型；不保证能解释因果。没有人物识别、个人身份确认、场景条件模型、时间衰减或非线性交互项。
- 时间间隔超过 5 分钟形成新场景；每批最多 12 张提特征。固定锚点只能降低跨批漂移，不能保证完全一致。分组可能误把不同主体放一起。
- 服务支持可选 `faceBase64` 局部图，但客户端**尚未自动检测/裁剪人脸**。本版没有声称完整的“全图 + 人脸局部”细节识别。
- 不可分辨的候选一并保留。询问策略是 `p(1-p) × 特征差平方和` 的启发式，最多 3 对/场景，尚未证明比随机选对更有效。
- 与新交接文档的差异：本实验模型没有沿用旧计数器的“分差 ≤2 留 1–3 张”规则，因为两套分数尺度不同；也未实现 Keep both 自动提高上限。不可辨识的多张图允许全部保留。无脸/无法评估的图不进入不保留建议，但仍需要 VLM 分类；尚未实现上传前的人脸筛选。
- 分数概率未校准。没有自动删除、Drive 备份、长期后台 agent。真实效果需要下面的独立留出集。

## 真人实验数据格式

先固定用户及用途（例如“自然朋友圈人像”）。按**拍摄会话**拆分训练/测试，再选图片对，不能先随机拆图片对。用稳定全局图片 ID；同一连拍的近重复图片不得跨分区。每个文件只放一个用户/用途。

```json
{
  "featureVersion": "portrait-anchors-v1",
  "train": [{
    "id": "choice-1", "sceneId": "session-1", "aId": "photo-1", "bId": "photo-2",
    "a": {"face_small":3,"jawline":3,"big_eyes":4,"facing_camera":3,"smile_teeth":2,"camera_high":3,"lighting":4,"expression":4},
    "b": {"face_small":3,"jawline":3,"big_eyes":3,"facing_camera":3,"smile_teeth":2,"camera_high":3,"lighting":4,"expression":3},
    "target": 1
  }],
  "test": [{
    "id": "choice-2", "sceneId": "session-2", "aId": "photo-3", "bId": "photo-4",
    "a": {"face_small":3,"jawline":3,"big_eyes":4,"facing_camera":3,"smile_teeth":2,"camera_high":3,"lighting":4,"expression":4},
    "b": {"face_small":3,"jawline":3,"big_eyes":3,"facing_camera":3,"smile_teeth":2,"camera_high":3,"lighting":4,"expression":3},
    "target": 0
  }]
}
```

`target=1` 用户选 A，`0` 选 B，`0.5` 必须是用户明确说无偏好。上面仅为格式示例，不是真人标注。图片不可判断用对应特征 null；无法提供选择的图片对应跳过。

```bash
npm run evaluate:preferences -- /absolute/path/to/user-labels.json
```

评估器只在 train 更新参数，拒绝重复图片对、场景/图片 ID 泄漏；不能自动发现换了 ID 的同一张照片。报告留出集二选一准确率、通用基线、Brier、log loss、无法区分比例及实验性阈值覆盖率。冷启动排序使用通用分数，概率仍为 0.5，因此校准指标只反映个人模型。不要把真人数据提交到公共仓库。

建议先招 5–10 人，每人至少 10 个独立会话、60–100 个选择；锁定测试会话，对同一个测试集比较 0/5/10/20/40 条训练反馈。单独报告近重复子集、Top-1/Top-2 命中和人工纠正率；本脚本目前仅实现 pairwise 评估，Top-k 需另建整组标注。抽样重复选择测用户一致性，独立重复 VLM 请求并交换顺序测特征稳定性（绕过缓存，固定模型和提示词）。

实验结果及已知问题见 [EXPERIMENTS.md](EXPERIMENTS.md)。没有真人标签和供应商凭据时，只能运行模拟和传输 fixture 测试，不能据此宣称 VLM 看图准确。
