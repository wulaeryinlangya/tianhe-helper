# 天河政策通 · AI政策申报助手

> 天河区AI大赛 · 板块二「AI应用创新·数智天河」参赛作品

输入企业画像，1 秒匹配天河区可申报的惠企政策，用 AI 判断"你是否符合条件、怎么申报"，每条政策附官方原文链接可核实。

## ✨ 核心功能

- **企业画像 → 政策智能匹配**：输入行业/规模/类型，秒出匹配的天河政策
- **可解释匹配**：每条政策展示"为什么匹配"的逐条理由（行业/规模/类型命中），透明可核对
- **AI 政策问答**：针对某条政策提问"我符合吗？怎么申报？"，结合企业画像与政策原文生成回答
- **申报窗口与临期提醒**：展示真实申报窗口，临期高亮
- **政策原文链接**：每条政策附天河区政府官网原文，可点击核实
- **离线演示模式**：`?demo=1` 断网也能完整体验

## 🛠 技术栈

- **前端**：Vue 3 + Vite（静态单页应用，零后端）
- **匹配引擎**：画像字段 × 政策条件的标签匹配 + 可解释打分（`src/lib/matcher.js`）
- **大模型**：火山方舟 API（`api/chat.js` Serverless 函数），问答失败自动降级到本地演示答案
- **政策数据**：`data/policies.json`（21 条天河区真实政策，全部来自官方来源，含链接）
- **数据核验**：`npm run verify:policies` 确定性校验（域名白名单/日期金额电话正则/链接存活/窗口一致性），输出 `data/verification.json`，列表页与详情页展示核验徽章

## 🚀 本地运行

```bash
npm install
npm run dev                  # 开发
npm run build                # 生产构建
npm run verify:policies      # 校验政策数据（需联网，测链接存活）
npm run verify:policies:offline  # 离线校验（跳过链接存活）
npm run collect:policy       # 五层政策采集流水线（写入 data/staging）
```

## 🔑 配置大模型 API（可选）

本地开发如需真实 AI 问答，创建 `.env.local`（已被 gitignore 忽略）：

```
ARK_API_KEY=你的火山方舟Key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
ARK_MODEL=deepseek-v4-flash-ga-260731
```

不配置也能运行（AI 问答自动用演示模式降级回答）。

## 📁 项目结构

```
├── data/
│   ├── policies.json         # 政策数据（真实，含官方链接）
│   └── verification.json     # 核验报告（npm run verify:policies 生成）
├── scripts/
│   ├── verify-policies.mjs   # 确定性字段校验脚本
│   ├── collect-policy.mjs    # 五层采集流水线骨架
│   └── lib/policy-utils.js   # 校验/采集共用工具
├── src/
│   ├── lib/
│   │   ├── matcher.js        # 匹配引擎 + 可解释打分
│   │   ├── llm.js            # 大模型问答调用
│   │   ├── md.js             # 极简 Markdown 渲染（QA 回答）
│   │   ├── verification.js   # 核验报告读取
│   │   └── demo.js           # 离线演示数据
│   └── components/
│       ├── ProfileForm.vue   # 首页：企业画像表单
│       ├── PolicyList.vue    # 政策匹配列表
│       └── PolicyDetail.vue  # 政策详情 + AI 问答
└── api/chat.js               # Serverless 问答函数（Vercel）
```

## 📋 协作说明

- 政策数据统一维护在 `data/policies.json`，**新增政策必须附官方来源链接**
- 匹配规则在 `src/lib/matcher.js`，可扩展行业/类型标签
- 改动后跑 `npm run build` 确认无编译错误
