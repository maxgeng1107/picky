# Picky 当前接口

## 默认手机

保留 main@94bf628 的计数器、通用分数、选片规则、评分定义与 512px JPEG 输入。`POST /api/select` 请求 `{ sceneId, photos: [{id,imageBase64}] }`，响应 `{label,photos:[{id,person,gated,scores}]}`。8 个维度返回 1–5 的整数；当前 main 仍用场景内相对评分。

`server/legacy-vision.ts` 复用原提示词和结构化输出设置，补充唯一 ID/完整响应校验、无效缓存重算、基于模型/提示词/属性定义/图片内容的缓存、60 秒超时、单并发、请求去重和默认每进程 60 次调用上限。SDK 不自动重试。计数上限不是美元消费上限，重启重置。

默认 `src/lib/taste.ts` 不改计数/评分计算。相同反馈与旧版算法回归对照。混合证据和重复支持只作为描述性文案；偏好保存在设备，重新选片保留，主快照损坏可用备份恢复，Reset 清空。旧页面双击不能给下一对图片贴标签。

## Drive JPEG 备份

服务端需要 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REFRESH_TOKEN；这是配置账号的演示服务，不是多租户授权系统。`GET /api/upload` 返回是否配置；`POST /api/upload` 接收 `{id,filename,imageBase64}`，最多 20 MiB JPEG 副本。

Drive folder 为 Picky Cloud Bin；文件按资产 ID/内容散列查找并复用匹配备份，否则以 resumable 协议上传。只有返回的文件 ID、MD5 和大小确认完整上传后，才返回 `{photoId,driveFileId,verified:true,...}`。手机只删除与原资产 ID 对应的已确认列表，并取得用户与系统确认。部分失败的原图保留；配置缺失不提供直接删除 fallback。

JPEG 副本不等同于 HEIC/Live Photo 原件，转换限制须在删除前说明。expiresAt=30 天仅为标签，未实现自动清理。未上传的照片显示“原图仍在手机”，不宣称进入云盘；完成备份和删除后才显示对应状态。

## 新排序器实验

`src/lib/personalization/` 与 `server/vision.ts` 为独立实验，使用固定锚点、小数/null/并列，支持局部图输入但没有自动裁脸。`npm run experiment:real` 收集盲选，按拍摄会话隔离 train/test。当前只有模拟结果和协议 fixtures，没有证据证明优于默认 VLM 或带用户示例的 VLM，所以不默认替换。

前台检测与预约通知继续保留；完整后台整理、真机流程、真实 API 与真人准确率均需另外验收。完整取舍见 server/DECISIONS.md。
