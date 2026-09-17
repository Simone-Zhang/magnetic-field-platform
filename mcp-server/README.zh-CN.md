# 磁场实验生产数据只读 MCP Server

这是一个面向 ChatGPT/Codex 的私有 MCP Server。它只读取管理员批准、去标识化的导出快照，不直接扫描 Unity 工程、Git 仓库、浏览器缓存或用户电脑的下载目录，也不连接生产写库。

## 已实现的安全边界

- 仅 stdio 传输：进程不监听 TCP 端口，建议通过 OpenAI Secure MCP Tunnel 的出站 HTTPS 通道接入。
- 默认拒绝：只识别 `config/datasets.json` 中登记的数据集、扩展名和字段；调用者不能传任意路径、SQL 或脚本。
- 文件系统防护：拒绝绝对路径、`..`、隐藏文件、疑似凭据文件、符号链接/目录联接逃逸，并以只读模式打开文件。
- 数据最小化：敏感字段名二次拦截；PDF/PNG 只返回元数据与哈希，不返回正文。
- 性能隔离：默认每分钟 30 次、并发 2、查询 2 秒、单文件 5 MiB、单次 20 MiB、最多扫描 200 文件/50,000 记录、最多返回 50 行。
- 可审计：每次调用记录 request id、工具、数据集、参数 HMAC 指纹、耗时、扫描/返回数量与结果状态；不记录参数原文和返回正文。审计写入失败时查询失败关闭。
- 所有工具均标注 `readOnlyHint: true`、`openWorldHint: false`、`destructiveHint: false`。

## 数据范围

当前两个项目没有服务端业务数据库。Unity 实验记录在运行时内存中，用户主动导出为 JSON；网站是静态站点。因此本服务读取以下“批准快照”，而不是声称能读取不存在的线上用户库：

1. `D:\31508\location2\final Experiment\MCPData`
2. `D:\31508\Documents\GithubPlatform\magnetic-field-platform\mcp-data`
3. `D:\31508\Documents\GithubPlatform\magnetic-field-platform\reports`（仅制品元数据）

前两个目录内真实数据不会进入 Git。由数据管理员把经过分类、去标识化和批准的 `.json/.jsonl/.csv/.tsv` 快照放入目录。若将来增加数据库，应创建只读副本/只读账号与允许查询的视图，再新增专用适配器；不要把任意 SQL 工具暴露给模型。

## 安装与验证

```powershell
Set-Location 'D:\31508\Documents\GithubPlatform\magnetic-field-platform\mcp-server'
& 'D:\31508\npm.cmd' ci --ignore-scripts
$env:MCP_AUDIT_HMAC_KEY = '<从凭据管理器注入的至少 32 字符随机值>'
& 'D:\31508\npm.cmd' run check
```

不要创建或提交 `.env`。生产环境通过 Windows 服务账户、凭据管理器或受控服务环境注入 `MCP_AUDIT_HMAC_KEY` 和目录变量。服务账户只需三个数据目录的“读取和执行/列出/读取”权限，以及审计目录的“追加/创建”权限；不应拥有项目仓库写权限。

可用只读工具：

- `list_datasets`
- `describe_dataset`
- `query_records`
- `aggregate_records`
- `list_report_artifacts`

## 私有接入 ChatGPT

1. 在 OpenAI Platform 的 Tunnel settings 创建隧道，范围只关联目标个人/工作区与所需组织。
2. 在本机或内网服务主机安装官方 `tunnel-client`，使用专用运行时 API key；密钥只放凭据管理器/服务环境，不写入参数、日志或仓库。
3. 让 `tunnel-client` 通过 stdio 启动：

```powershell
tunnel-client init `
  --profile magnetic-field-readonly `
  --tunnel-id '<tunnel_id>' `
  --mcp-command "D:\31508\node.exe D:\31508\Documents\GithubPlatform\magnetic-field-platform\mcp-server\src\server.js"
tunnel-client doctor --profile magnetic-field-readonly --explain
tunnel-client run --profile magnetic-field-readonly
```

4. 在 ChatGPT 的开发者模式创建 App，连接方式选择 Tunnel，只启用这里列出的只读工具。不要把隧道端点当作公网 `server_url`。
5. 上线前用独立、非管理员、非数据所有者的 Windows 服务账户运行，并执行静态 ACL 检查：

```powershell
.\scripts\verify-readonly-acl.ps1 -ServiceAccount '<DOMAIN\mcp_reader>'
```

该脚本检查账户的直接 ACL 与所有权，但不能解析账户经组成员关系获得的有效权限；投产前还必须在该服务身份下做有效访问验证。

`start-low-priority.ps1` 会把 Node 进程优先级设为 `BelowNormal`，进一步降低对交互式生产程序的竞争。更强隔离可使用单独 VM/容器，只读挂载快照目录并设置 CPU/内存配额。

## 运维与审计

- 审计目录与数据目录必须分离，交给日志采集器只读采集，并按组织策略设置保留期、不可篡改存储和告警。
- 对 `outcome=error`、频率限制、连续大扫描、数据目录不可用、审计写入失败设置告警。
- 每次新增字段都必须修改 `config/datasets.json`、做数据分类评审并重新运行测试；未登记字段自动消失。
- 轮换 Tunnel runtime key 与 `MCP_AUDIT_HMAC_KEY` 时，不要在工单或聊天中粘贴值。
- 停用时先在 ChatGPT 禁用 App/撤销 Tunnel Use，再停止 `tunnel-client`，最后撤销服务账户对数据目录的读权限。
