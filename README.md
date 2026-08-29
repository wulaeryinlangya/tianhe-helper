# 天河政策通 · AI政策申报助手

> 天河区AI大赛 · 板块二「AI应用创新·数智天河」参赛作品

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwulaeryinlangya%2Ftianhe-helper&env=DEEPSEEK_API_KEY&envDescription=DeepSeek%20API%20Key%20%E7%94%A8%E4%BA%8E%20AI%20%E9%97%AE%E8%AF%8A%E5%8A%9F%E8%83%BD&project-name=tianhe-helper&repository-name=tianhe-helper)

输入企业画像，1 秒匹配天河区可申报的惠企政策，用 AI 判断"你是否符合条件、怎么申报"，每条政策附官方原文链接可核实。

## ✨ 核心功能

- **企业画像 → 政策智能匹配**：输入行业/规模/类型，秒出匹配的天河政策
- **🤖 AI 智能问诊**：3-5 轮对话式企业画像构建，雷达图可视化多维分析
  - 前 2 轮规则化快速问答
  - 后 3 轮 DeepSeek AI 智能追问
  - 自动提取研发投入、专利数量、资质认证等关键信息
- **可解释匹配**：每条政策展示"为什么匹配"的逐条理由（行业/规模/类型命中），透明可核对
- **💬 AI 政策问答**：针对某条政策提问"我符合吗？怎么申报？"，结合企业画像与政策原文生成回答
- **📰 政策动态自动轮换**（新）：
  - 左侧栏展示天河区最新政务新闻
  - 新闻池10条，每天自动显示不同的3条
  - AI生成精美封面图，提升视觉体验
  - 每天9:00自动爬取最新新闻并更新
  - 基于日期的确定性随机算法，同一天内显示一致
- **🔄 自动更新系统**：
  - GitHub Actions 每周自动验证政策数据
  - 每天自动更新新闻动态和封面图
  - 手动更新检查（头部常驻按钮）
  - 7 天未更新自动提醒
  - 智能版本对比
- **申报窗口与临期提醒**：展示真实申报窗口，临期高亮
- **政策原文链接**：每条政策附天河区政府官网原文，可点击核实
- **离线演示模式**：`?demo=1` 断网也能完整体验

## 🛠 技术栈

- **前端**：Vue 3 + Vite（静态单页应用）
- **匹配引擎**：画像字段 × 政策条件的标签匹配 + 可解释打分（`src/lib/matcher.js`）
- **大模型**：
  - DeepSeek Chat API（AI 智能问诊 + 政策问答）
  - Serverless 函数部署（`api/profile-chat.js`, `api/chat.js`）
- **可视化**：ECharts + vue-echarts（雷达图企业画像）
- **自动化**：
  - GitHub Actions（每周政策数据验证 + 每天新闻更新）
  - Playwright 爬虫（自动抓取天河区政府网站新闻）
  - AI 图片生成（新闻封面图自动生成）
- **持久化**：localStorage（用户画像本地缓存）
- **数据源**：
  - 政策数据：`data/policies.json`（21 条天河区真实政策，全部来自官方来源，含链接）
  - 新闻数据：`data/news.json`（10 条最新政务新闻，每天自动更新）
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

### 新闻自动更新脚本

```bash
# 爬取最新新闻（抓取10条）
node scripts/crawl-news-deep.mjs

# AI生成新闻封面图
node scripts/generate-ai-thumbnails.mjs

# 或使用网页截图方式（需先安装 puppeteer）
npm install --save-dev puppeteer
node scripts/capture-news-thumbnails.mjs
```

脚本会自动访问天河区政府网站，抓取最新新闻并生成封面图，保存到 `data/news.json` 和 `public/news-thumbnails/`。

## 🔑 配置大模型 API

### 本地开发

创建 `.env.local`（已被 gitignore 忽略）：

```env
DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com  # 可选，默认值
```

### Vercel 部署

在 Vercel 项目设置中添加环境变量：
- `DEEPSEEK_API_KEY`：必需，用于 AI 智能问诊和政策问答
- `DEEPSEEK_BASE_URL`：可选，默认为 `https://api.deepseek.com`

**获取 DeepSeek API Key**：访问 https://platform.deepseek.com/

## 📁 项目结构

```
├── .github/workflows/
│   ├── weekly-policy-check.yml  # 每周自动验证政策数据
│   └── update-news.yml          # 每天自动更新新闻（9:00）
├── data/
│   ├── policies.json            # 政策数据（21条真实政策，含官方链接）
│   ├── news.json                # 新闻数据（10条最新政务新闻）
│   └── verification.json        # 核验报告（npm run verify:policies 生成）
├── scripts/
│   ├── verify-policies.mjs      # 确定性字段校验脚本
│   ├── collect-policy.mjs       # 五层采集流水线骨架
│   ├── crawl-news-deep.mjs      # 新闻爬虫（Playwright）
│   ├── generate-ai-thumbnails.mjs  # AI封面图生成
│   ├── capture-news-thumbnails.mjs # 网页截图封面（备选）
│   └── lib/policy-utils.js      # 校验/采集共用工具
├── api/
│   ├── chat.js                  # Serverless 政策问答函数
│   └── profile-chat.js          # Serverless AI 问诊函数
├── src/
│   ├── lib/
│   │   ├── matcher.js           # 匹配引擎 + 可解释打分
│   │   ├── profileSchema.js     # 企业画像数据结构 + 雷达图计算
│   │   ├── profileChat.js       # AI 问诊前端接口
│   │   ├── storage.js           # localStorage 持久化
│   │   ├── llm.js               # 大模型问答调用
│   │   ├── md.js                # 极简 Markdown 渲染
│   │   ├── verification.js      # 核验报告读取
│   │   └── demo.js              # 离线演示数据
│   └── components/
│       ├── ProfileForm.vue      # 首页：企业画像表单
│       ├── AIConsultant.vue     # AI 智能问诊对话
│       ├── ProfileRadarChart.vue # 企业画像雷达图
│       ├── UpdateNotice.vue     # 更新提醒通知
│       ├── PolicyList.vue       # 政策匹配列表
│       └── PolicyDetail.vue     # 政策详情 + AI 问答
├── public/
│   └── news-thumbnails/         # 新闻封面图（AI生成或截图）
└── vercel.json                  # Vercel 部署配置
```

## 📋 协作说明

- 政策数据统一维护在 `data/policies.json`，**新增政策必须附官方来源链接**
- 匹配规则在 `src/lib/matcher.js`，可扩展行业/类型标签
- 改动后跑 `npm run build` 确认无编译错误
