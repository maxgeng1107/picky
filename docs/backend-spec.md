# Picky 当前接口与学习规则

此文替代早期的“每批拉开分数 + support/against 决定置信状态”演示规格。完整设置见根目录 README 和 server/README。

## 图片评分

`POST /api/select`（Expo Router server route）

请求：`{ sceneId, photos: [{ id, imageBase64, faceBase64? }] }`。
每批 1–12 个唯一 ID 的 JPEG；服务验证 base64 类型、大小和 JPEG 标记，并限制整体请求体大小。客户端最长边 1568，JPEG 质量 0.9，不放大小图；编码后清理生成的 JPEG 缓存文件并释放图像引用。

响应：`{ label, photos: [{ id, person, gated, scores }] }`。
`scores` 包括 face_small、jawline、big_eyes、facing_camera、smile_teeth、camera_high、lighting、expression，取值 1–5 的有限数或 null。缺失、重复或未知 ID 和无效分数都报错，不补造分数。person=false 的图片不进入推荐流程；无法评估但有人的照片保留原图。闭眼本身不是质量淘汰理由。

VLM 使用 `src/lib/personalization/features.ts` 的固定锚点。并列、小数、null 都有效；不要求场景内最好=5、最差=1。face_small 不把脸在画面里占比小、拍得远或侧脸直接当作脸更瘦。VLM 只描述，不猜用户喜欢哪张。

`server/vision.ts` 为手机和真人实验共用。密钥只在服务端，支持 ANTHROPIC_API_KEY 或 LLM_API_KEY。模型可用 ANTHROPIC_MODEL 配置。每进程默认最多 60 次调用尝试；一次只运行一个付费请求，相同进行中请求去重；60 秒超时，无自动重试。MAX_VLM_CALLS 是次数而非美元上限，重启会重置。缓存由模型、特征版本、提示词和实际图片内容生成 SHA256；只落盘属性，不落盘图片或密钥。USE_CACHE=0 关闭磁盘缓存；稳定性检查显式绕过缓存。

400/413 表示请求错误或过大，429 表示忙/供应商限流，502 表示无有效模型响应，503 表示缺少配置或达到调用上限。不能把失败替换成模拟分数。

## 个人学习与推荐

8 维归一化属性差作为 pairwise logistic ranker 的输入，带 L2 正则；每次从最多 300 条独立比较重拟合，固定 240 步优化。图片对使用全局资产 ID 去重，重新分场景也不会累计相同图片对。

Keep A / B replaces A 才形成胜负证据。Keep both / Skip / 单独救回一张图不形成胜负；真人实验里的明确无偏好可以记平局。差异不可观测时不制造证据。只显示临时倾向，不根据少量计数宣布 confident 或 doesn't care。

对未复核场景重排；不可区分的候选一并保留，无法评分的照片也保留。提问启发式为 p(1-p) 乘属性差平方和，每场景最多 3 对，已回答的图片对不重复提问。该启发式及模型概率都没有真人校准，不能据此自动删除。

手机偏好、版本和处理过的资产 ID 存在设备文件，保存上一份有效快照作恢复；重新读取相册和再次选片保持偏好。Reset 清空主快照与备份。处理检查点在整轮成功后推进，失败或取消不吞掉未处理照片；通知失败不丢学习结果。

## 原图、通知与实验

当前没有 /api/upload、Drive OAuth、云备份或照片删除。binned 仅是 UI/数据结构里的“未推荐”，所有原图保留。不要显示“已上传 Drive”或释放空间数字。

前台检测、空闲计时和本地提醒已实现；不承诺后台完整执行选片。真人实验工具只监听 loopback，按拍摄会话隔离 train/test，预测在标注完成前隐藏。原始图不写实验文件，只保存哈希、属性、标签和报告，文件位于 gitignore 的 server/runs/。

真实 API 成功与准确理解用户审美是不同的验收项。需使用真人选择的独立测试集验证；Top-k、自动人脸裁剪、情境偏好和长期后台可靠性仍待完成。
