# CLI 输入

执行位置：McFork 项目根目录。输入 JSON 用本机临时文件，勿加入 Token。

## 搜索门店

```json
{"mode":"live","city":"杭州","keyword":"武林广场"}
```

运行 `npm run --silent fork -- stores input.json`。向用户展示名称、地址、门店 ID，按用户选择继续。

## 当前菜单 / 默认详情

```json
{"mode":"live","city":"杭州","keyword":"武林广场","storeId":"从搜索结果取得"}
```

运行 `npm run --silent fork -- menu input.json`。详情额外提供从菜单取得的 `code`，使用 `detail` 命令。输出餐品编码不可自行编造。

## 比较餐单

```json
{
  "mode":"live",
  "city":"杭州",
  "keyword":"武林广场",
  "storeId":"从搜索结果取得",
  "budgetCents":4800,
  "items":[
    {"productCode":"从菜单取得","quantity":1,"locked":true},
    {"productCode":"另一餐品编码","quantity":1,"locked":false}
  ]
}
```

运行 `npm run --silent fork -- compare input.json`。CLI 会重新搜索确认该门店仍属于搜索结果，再使用与网页相同的引擎核价比较。支持 1–10 种餐品，每种 1–20 份；预算是整餐预算，单位分。

演示：`npm run --silent fork -- compare examples/compare.json`。演示无须凭据，使用真实门店/菜单快照与本地试算，不能描述为官方当次核价。
