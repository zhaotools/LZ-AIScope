# LZ-AIScope

AI 产业周期观察的第一版。按期保存人工判断与来源，GitHub Actions 每天采样公开的 SEC 公司财报和 Aquanode GPU 挂牌报价，再把同一份静态页面发布到 GitHub Pages。

- 网站：<https://zhaotools.github.io/LZ-AIScope/>
- 仓库：<https://github.com/zhaotools/LZ-AIScope>
- 部署和更新记录：<https://github.com/zhaotools/LZ-AIScope/actions>

## 数据如何更新

| 文件 | 更新方式 | 内容 |
| --- | --- | --- |
| `data/issue.json` | 人工提交到 `main` | 本期判断、三维证据、来源和往期目录 |
| `data/issues/*.json` | 人工提交到 `main` | 每期完整判断快照，供历史目录回看 |
| `data/auto.json` | 每日 GitHub Actions / 手动运行工作流 | SEC 最近可配对现金 Capex / OCF、Aquanode 报价摘要 |
| `data/history.json` | 同一工作流 | 最多 120 日自动采样；同日期覆盖，不伪造上线前历史 |

工作流位于 `.github/workflows/publish.yml`，由推送、每天北京时间约 09:17，以及 Actions 页面的 **Run workflow** 触发。定时运行可能因 GitHub 队列延迟。工作流更新 JSON 后会在同一次运行中发布 Pages；无需额外服务器、数据库或第三方运行包。

### 编辑下一期

1. 复制上一期 `data/issue.json` 的结构，更新 `number`、`date`、标题、判断和三维证据。每个证据都要核对来源链接、统计期间和文字口径。
2. 将新一期完整内容保存为 `data/issues/日期.json`，在 `archive` 中增加对应路径，同时保留所有往期条目。不要把自动采样值直接写成周期评分。
3. 提交到 `main`。GitHub Actions 会校验 JSON、刷新自动数据并部署页面。上线后检查 Pages 工作流和页面内容。

### 本地预览

需要 Node.js 22 或更新版本。无须安装依赖：

```bash
node scripts/check.mjs
node --test tests/*.test.mjs
python3 -m http.server 8787
```

浏览器访问 `http://127.0.0.1:8787/`。要主动抓取公开数据，执行 `node scripts/update-data.mjs`；该命令会修改 `data/auto.json` 和 `data/history.json`。

## 口径与边界

- SEC `companyfacts` 提供公司整体现金流项目。程序只配对同一报告、同一期间的现金资本开支与经营现金流，并显示财务期间和披露日。它不是 AI 业务收入或投资回报。
- Aquanode 数据只统计可用、非 spot 的 B200/H100 挂牌报价。中位数混合不同供应商、地区、配置和条款，不是成交价或行业价格指数。
- 如果来源读取失败，已有数据保留并标记状态，不用参考值冒充新数据。已获准的 SEC 联系邮箱仅存于仓库 Actions secret `SEC_USER_AGENT`，不提交到代码；默认值指向仓库 Issues。
- 本页是研究记录，没有自动周期评分、价格预测或交易信号。首期历史只从实际发布开始。

## GitHub Pages 设置

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。站点从自定义工作流发布；仅公开静态文件，无 Sites 项目身份、登录或私有浏览器记录。
