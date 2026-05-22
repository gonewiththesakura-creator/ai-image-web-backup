# DreamAPI AI 生图网页

一个只调用 Sub2API `/v1/images/generations` 的 AI 作图网页。

- 页面只展示图片，不展示聊天文本
- 后端强制使用 `gpt-image-2`
- 用户输入的任何内容都会被当作图片 prompt
- 用户在网页里填自己的 API Key

## 部署

```bash
cd /home/admin/ai-image-web
docker compose up -d --build
```

## 本地验证

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/
```
