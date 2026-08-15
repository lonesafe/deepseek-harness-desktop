# Agent Note: 经过认证的局域网 Web 访问

Status: implemented

[English](2026-08-15-authenticated-lan-web-access.md) | 中文

## 问题

Web 载体已经理解全接口绑定与局域网 Host authority，但已发布命令会拒绝这种绑定，因为 authority 匹配防止的是 DNS 重绑定，并不能认证具体用户。匿名开放应用会让网络中的每台设备都能访问会话与智能体操作，包括基于 workspace 的命令执行。桌面产品需要可明确启用、可撤销的局域网访问，同时不能把网络暴露变成默认行为，也不能强迫本机 Electron 窗口登录。

## 决策

**局域网暴露是持久化的桌面端选择。** 应用菜单可以启用、查看、复制和停用局域网访问。启动器在 Electron 的逐用户数据目录中保存带版本的 `lan-access.json`，以仅所有者可读写的原子写入保存，并让一份随机生成的 32 字符 token 在重启与停用／启用之间保持不变。更改偏好会替换受管后端 generation；新的绑定失败时，程序会先恢复此前的文件与后端，再报告失败。

**全接口绑定必须在 Web 载体处认证。** 只有同时提供不少于 24 个字符的 `--access-token` 时，`dsh web --host 0.0.0.0` 才会被接受。`dsh-host-webserver` 会在 route 查找之前，把未认证的非回环 HTML 导航重定向到无脚本中文登录页；固定用户名为 `deepseek`，配置 token 作为密码。表单或 HTTP Basic 认证成功后，会签发一份从 token 推导的确定性 HttpOnly、SameSite=Lax session cookie；后续 HTTP 请求与 WebSocket upgrade 会提供该 cookie，远程认证响应也禁止缓存。凭据与 cookie 都以 timing-safe 方式比较。回环 socket 跳过认证，因为本地进程在此功能之前就拥有完整访问能力；Electron 窗口继续只加载精确的随机回环 origin。

**浏览器 RPC id 不能要求安全上下文。** Chromium 中的明文 HTTP 非回环页面拥有 `crypto.getRandomValues()`，但没有 `crypto.randomUUID()`。因此 Web 载体使用本地 RFC 4122 version 4 格式器覆盖 RPC id 生成，随机字节由 `getRandomValues()` 提供。这样既保留相同的随机 UUID 形态与熵，也让已认证局域网页面能够完成初始 `host.describe` 握手。

**认证与浏览器信任仍是两道独立检查。** 既有 Host authority 栅栏会在 Web 认证之后继续拒绝跨站与 DNS 重绑定形式的请求。程序只从运行中的全接口绑定采样一次局域网 IP literal，并继续把它们作为可信 authority。Host 设置、凭据、原生文件打开与智能体 preset 创作仍只限回环；局域网用户可以操作会话与智能体，但不能扩大 Host 配置面。

## 验证

Webserver 测试固定 token 要求、回环识别、精确 Basic 凭据、session cookie 行为与 HTTP／upgrade 共用的认证边界。客户端测试固定 `randomUUID()` 缺失时的 UUID 生成，以及不依赖安全上下文的 WebSocket 操作。真实 Loader 启动测试证明匿名或弱 token 的全接口调用不会释放依赖行，而经过认证的调用会正常释放；无密钥的真实 CLI 冒烟测试通过非回环接口访问服务器，证明匿名页面／API 拒绝、表单与 Basic 登录、cookie 认证 API，以及 cookie 认证 WebSocket upgrade。真实 Chromium 冒烟测试通过机器的局域网地址完成登录表单，并到达稳定连接的应用表层。桌面测试固定随机凭据持久化、损坏文件拒绝、局域网 argv 构造与就绪信息解析；桌面包构建覆盖 Electron 主进程集成。

## 考虑过的替代方案

**不认证，直接开放现有全接口服务器。** 不采用：应用提供 workspace 与命令执行能力，网络位置不能作为身份或同意边界。

**每次启动桌面端都启用局域网访问。** 不采用：公共或共享网络中的用户不应在没有明确操作时暴露 Harness。持久化用户选择既保留便利，也不改变安全默认值。

**把 token 放进查询字符串，或仅依赖浏览器原生 Basic 认证。** 查询字符串会进入历史记录、日志与复制链接，而 URL Basic 凭据无法延续到 Chromium 的 WebSocket 构造。专用同源登录 route 不把凭据放进 URL、不使用脚本、只接受有界表单请求体，并建立 HTTP 与 WebSocket 请求共用的最小 cookie session。

**要求用户自行部署反向代理。** 不采用将其作为唯一桌面路径，因为这违背自包含客户端目标。当局域网本身不可信时，TLS 反向代理仍是部署方案。

## 后果

用户通过一次菜单操作，就能让运行中的桌面后端被同一网络中的手机或电脑访问；应用会显示浏览器所需的地址、用户名和 token。本机桌面使用方式保持不变；停用后服务器恢复只绑定回环；损坏的持久化安全状态会关闭失败，而不会静默开放端口。

直接局域网流量与登录凭据仍是明文，因为内嵌服务器不终止 TLS。该功能只适用于可信网络；它只有一份进程级凭据，不提供按设备撤销或限速，可能触发操作系统防火墙提示，且改变暴露状态需要重启服务。桌面子进程通过参数列表接收 token，因此同一操作系统用户运行的其他进程可能可以查看它；该用户本就能控制 Harness 数据与进程。
