# 麦当劳 MCP 接入说明

McFork 仅连接官方 `https://mcp.mcd.cn`，使用官方 `@modelcontextprotocol/sdk` 的 `Client` 与 `StreamableHTTPClientTransport`。本机或后端环境变量 `MCD_MCP_TOKEN` 通过 Authorization Bearer 请求头发送给该服务，不存在第二个服务 Key。

## 实际工具与业务价值

| Tool | 用法 | 业务价值 |
| --- | --- | --- |
| `query-nearby-stores` | `beType:1, searchType:2, city, keyword` | 返回真实门店名称、地址、编号及营业信息；不依赖地图 |
| `query-meals` | 所选 `storeCode`, `orderType:1`, `beType:1` | 取得该店当前菜单、编码、图片与展示价 |
| `query-meal-detail` | 同门店及真实餐品 `code` | 核验默认搭配与默认特调参数，缺失时拒绝猜测 |
| `calculate-price` | 同门店、商品编码、数量、默认选配 | 对原餐单及替代方案逐单官方核价；金额以分保存 |

接入时执行 `tools/list` 确认工具存在。到店场景不传 `beCode`。配置实例见根目录 `mcp-config.example.json`，其中 Token 只使用环境变量占位符；不同 MCP 客户端对占位符的解析方式不同，须按客户端文档配置。本项目自身通过 Node.js 环境文件加载，不依赖客户端替换字符串。

## 调用流程

`搜索真实门店 → 选店 → 当前菜单 → 选择/锁定餐品 → 查询默认详情 → 核价原餐单 → 生成最多十一份替代候选 → 逐单核价 → 约束校验及排序 → 采用与导出`

候选初筛依靠当前菜单展示价，同类替换保留数量。最终仅展示满足预算、低于原餐单官方核价的合格方案。两端共用 `shared/engine.ts`，规则不是大模型临时心算。模型只在可选 Skill 客户端中负责理解语言。

代码中的工具白名单只包含上表四项。没有创建订单、领券、兑换或抽奖入口，亦不调用历史订单、用户地址等个人资料工具。

## 最小本机接口

- `GET /api/config`：仅返回实时模式是否已配置，不返回 Token。
- `POST /api/stores`：`mode, city, keyword`；返回门店与来源/查询时间。
- `GET /api/menu?mode=&storeId=`：返回该店菜单；实时门店须在最近搜索结果中。
- `GET /api/detail?mode=&storeId=&code=`：可确认的默认搭配。
- `POST /api/compare`：`mode, storeId, budgetCents, items:[{productCode,quantity,locked}]`。
- `POST /api/quote`：相同餐单参数，仅核价一单。

餐单最多十种，每种 1–20 份，预算为整餐 100–100000 分。重复餐品编码、空餐单、未知参数和无效数量被拒绝。真实请求与静态演示不能混用门店菜单。

选店界面使用城市、商圈联动下拉框。城市及商圈是项目内置的常用地点目录，按城市异步加载，不冒充官方地区数据；目前实际 `tools/list` 没有通用商圈列表工具，派对城市工具仅适用于派对商品。选中商圈即把其作为 `keyword` 调用既有 `/api/stores`；可选择「其他地点」手输地标。更换城市或商圈会清空旧查询结果并中止浏览器旧请求；服务端仍可能完成已发出的官方只读调用，但返回值不会覆盖新选择。无需新增第三方 Key。

## 证据与失败处理

真实调用脱敏记录见 `evidence/mcp-live-verification.json`，可用 `npm run verify:live` 重现。记录包含公开门店、餐品、整单金额、查询时间和 traceId；不包含 Authorization、用户账号或个人位置。

官方原餐单核价失败时中止比较。候选失败时排除该候选并报告失败数量；认证失败、限流或凭据未配置时直接报告，不伪装成“没有方案”。非结构化工具文本、业务失败、金额或返回餐品不匹配都不会成为已核验报价。

公开演示使用 `shared/snapshot.json` 的公开数据与本地试算，所有结果 `verified:false`。真实门店不等于演示试算已获官方核价。

## 本机保护

服务仅监听 127.0.0.1，校验 Host/Origin、请求类型和输入体积，拒绝读取环境文件；日志不输出上游原始错误。Token 只由服务端发往官方 MCP，前端构建和小票导出不包含 Token。菜单与详情缓存最多五分钟。

官方文档：https://github.com/M-China/mcd-mcp-server
## 线上部署补充

GitHub Pages 前端只保存公开的后端地址。Netlify Functions 从 Functions 范围的 `MCD_MCP_TOKEN` 加密环境变量读取凭据，复用 `server/service.ts` 与 `server/mcd.ts`；响应、日志与网页构建不返回 Token。公开后端只开放 config、stores、menu、detail、quote 五个应用接口，不允许调用任意 MCP 工具。

门店查询响应附带一小时有效的签名选择凭证，后续菜单、详情与核价请求通过请求头提交；后端验签后恢复门店校验，避免依赖某一个函数实例的内存。前端共用 `shared/engine.ts` 并逐份请求官方核价；没有改用展示价替代官方报价。

跨域仅允许 `https://everfu.github.io`，平台按 IP 限流。CORS 不构成用户认证。该部署面向公开展示，只访问已有四个只读工具；无订单、领券或账户写入。
