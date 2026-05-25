# 极趣(zectrix)墨水屏推送新闻API

## .env  (环境配置)
设置 `APIKEY=zt_*****************`   
设置 `DEVICEID=**:**:**:**:**:**` (MAC号)  
设置 `PW=密码` (可选,如设置,/api?pw=xxx请求)

## `/api/image` 用法
用于生成墨水屏图片，并可直接推送到设备。

热搜区域当前显示 8 条：
- 前 3 条固定取微博热搜前 3
- 后 5 条从剩余热搜里随机抽取

### 基本请求
如果配置了 `PW`，请求时需要带上 `pw` 参数：

```text
/api/image?pw=你的密码
```

### 参数说明
- `pw`
  如果 `.env` 配置了 `PW`，则必须传入相同密码，否则返回 `401 Unauthorized`。
- `location`
  天气位置，传给心知天气接口使用。默认值为 `nanshan`。
- `preview`
  预览模式。传 `1`、`true`，或只写参数名都可以。
  开启后接口直接返回 PNG 图片，而不是 JSON。
- 字体固定使用 `Unifont` 点阵字模。
- `date`
  日期预览参数，格式 `YYYY-MM-DD`。用于测试日期、星期、农历、节气/倒数日和宜忌显示。
- `noPush`
  禁止推送到设备。传 `1`、`true`，或只写参数名都可以。
  开启后只生成图片或返回结果，不调用设备推送接口。
- `dither`
  推送到设备时附带的抖动参数，原样透传给极趣云接口。
- `pageId`
  推送到设备时附带的页面参数，原样透传给极趣云接口。
- `graphicsThreshold`
  图形元素二值化阈值，范围 `0-255`。默认 `50`。
  值越小，图形边缘越柔；值越大，图形越硬。

### 返回行为
- 默认情况：
  接口会生成图片并推送到设备，返回 JSON，例如：

```json
{
  "completed": true,
  "pushed": true
}
```

- `preview=1`：
  返回 `image/png` 图片内容。

- `noPush=1`：
  不推送设备；如果未开启 `preview`，仍返回 JSON。

### 示例

生成并推送：

```text
/api/image?pw=你的密码
```

只预览图片，不推送：

```text
/api/image?pw=你的密码&preview=1&noPush=1
```

指定天气位置并预览：

```text
/api/image?pw=你的密码&location=shenzhen&preview=1&noPush=1
```

指定日期预览：

```text
/api/image?pw=你的密码&date=2026-02-04&preview=1&noPush=1
```
