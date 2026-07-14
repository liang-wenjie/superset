# Superset Docker 本地开发与部署指南

本文整理当前工作区使用 Docker 和本机 Python 环境运行 Superset 的常用流程，以及元数据库、依赖和启动故障的处理方式。

## 目录

- [选择运行模式](#选择运行模式)
- [Docker 构建部署](#docker-构建部署)
  - [配置元数据库](#配置元数据库)
  - [端口与健康检查](#端口与健康检查)
  - [初始化与日志](#初始化与日志)
  - [更新镜像与代码](#更新镜像与代码)
- [前端 Docker、后端本机](#前端-docker后端本机)
  - [启动前端容器](#启动前端容器)
  - [启动本机后端](#启动本机后端)
  - [PyCharm 配置](#pycharm-配置)
- [Windows 依赖：python-ldap](#windows-依赖python-ldap)
- [常见问题](#常见问题)
  - [SECRET_KEY 与已有元数据](#secret_key-与已有元数据)
- [部署到其他服务器](#部署到其他服务器)

## 选择运行模式

| 场景 | Compose 文件 | 适用情况 |
| --- | --- | --- |
| 日常源码开发 | `docker-compose.yml` | 挂载本地源码，支持前端热更新。 |
| 构建镜像后运行 | `docker-compose-non-dev.yml` | 将当前源码与依赖构建进镜像，接近部署环境。 |
| Docker 前端、本机后端 | `docker-compose.yml` + `docker-compose.backend-local.yml` | 调试 Python 后端，同时保留 Docker 前端环境。 |

## Docker 构建部署

使用 `docker-compose-non-dev.yml` 时，先构建镜像，再在后台启动服务：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml up -d
```

### 配置元数据库

元数据库配置位于 `docker/.env-local`。使用 Superset 的最终覆盖变量 `SUPERSET__SQLALCHEMY_DATABASE_URI`，不要通过修改 `DATABASE_DIALECT` 切换元数据库。

```env
SUPERSET_LOAD_EXAMPLES=no
SUPERSET_SECRET_KEY=replace_with_a_fixed_strong_secret
SUPERSET__SQLALCHEMY_DATABASE_URI=mysql://superset:password@127.0.0.1:3306/superset

SUPERSET_PORT=8088
REDIS_PORT=6379
```

不要使用下列变量配置元数据库：

```env
DATABASE_DIALECT=mysql
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_DB=superset
DATABASE_USER=superset
DATABASE_PASSWORD=password
```

`docker/pythonpath_dev/superset_config.py` 会根据 `DATABASE_DIALECT` 同时拼接 `SQLALCHEMY_DATABASE_URI` 与 `SQLALCHEMY_EXAMPLES_URI`。将其设为 `mysql` 后，示例数据加载流程可能使用 MySQL 驱动连接 Compose 中的 Postgres 服务，从而导致 handshake 失败。

数据库 URI 所用驱动必须写入 `docker/requirements-local.txt` 并重新构建镜像：

| URI | 所需依赖 |
| --- | --- |
| `mysql://...` | `mysqlclient` |
| `mysql+mysqlconnector://...` | `mysql-connector-python` |

例如，在 `docker/requirements-local.txt` 中加入：

```text
mysqlclient
```

然后执行：

```powershell
docker compose -f docker-compose-non-dev.yml build
```

### 端口与健康检查

`docker-compose-non-dev.yml` 将宿主机 `8088` 映射到容器内 `8088`，因此应保持：

```env
SUPERSET_PORT=8088
REDIS_PORT=6379
```

不要在该 Compose 文件下设置 `SUPERSET_PORT=8089`。否则 Gunicorn 会在容器内监听 `8089`，而访问 `http://localhost:8088` 会得到空响应。

验证服务：

```powershell
curl.exe http://localhost:8088/health
```

预期输出：

```text
OK
```

### 初始化与日志

`superset-init` 应正常完成并退出：

```text
superset_init  Exited (0)
```

常用命令：

```powershell
# 手动执行初始化
docker compose -f docker-compose-non-dev.yml run --rm superset-init

# 启动服务
docker compose -f docker-compose-non-dev.yml up -d

# 查看容器状态
docker compose -f docker-compose-non-dev.yml ps -a

# 查看服务日志
docker compose -f docker-compose-non-dev.yml logs --tail=300 superset
docker compose -f docker-compose-non-dev.yml logs --tail=300 superset-init
```

### 更新镜像与代码

`docker-compose-non-dev.yml` 将应用源码和依赖构建进镜像。修改以下内容后，需要重新构建相关镜像并重启容器：

- Python 后端源码或 React/TypeScript 前端源码
- Python、Node.js 或系统依赖
- Dockerfile 或镜像构建配置

构建并启动所有受影响服务：

```powershell
docker compose -f docker-compose-non-dev.yml up -d --build
```

只更新 Superset 应用镜像时：

```powershell
docker compose -f docker-compose-non-dev.yml build superset
docker compose -f docker-compose-non-dev.yml up -d superset
```

更新包含数据库迁移时：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml run --rm superset-init
docker compose -f docker-compose-non-dev.yml up -d
```

以下修改通常无需重新构建镜像：

- 仅修改通过 volume 挂载的配置文件
- 仅修改 `.env-local` 等运行时环境变量
- 仅修改文档、测试或未被镜像使用的文件

运行时配置变更后，重新创建容器即可；如果配置会在重启时重新读取，也可以只重启服务：

```powershell
docker compose -f docker-compose-non-dev.yml up -d
docker compose -f docker-compose-non-dev.yml restart
```

Docker 会复用构建缓存，但修改前端依赖或较早镜像层时，构建仍可能耗时较长。日常频繁开发建议使用 `docker-compose.yml`，无需在每次代码修改后重新构建。

## 前端 Docker、后端本机

覆盖文件 `docker-compose.backend-local.yml` 会：

- 将 `superset-node` 的后端地址指向 `http://host.docker.internal:8088`。
- 将 Docker 中的 `superset`、`superset-init`、`superset-worker` 与 `superset-worker-beat` 放入 `backend-in-docker` profile，默认不会启动。

### 启动前端容器

```powershell
docker compose -f docker-compose.yml -f docker-compose.backend-local.yml up -d superset-node

# 查看前端启动日志
 docker compose -f docker-compose.yml -f docker-compose.backend-local.yml logs -f superset-node
```

前端开发服务器地址：`http://localhost:9000`。

这里使用宿主机 `9000` 映射容器内 Webpack 的 `9000`，以避免与其他服务占用的宿主机 `9000` 和 `9001` 冲突。前端 API 请求会代理到本机后端的 `8089`。

### 启动本机后端

激活虚拟环境后设置环境变量。以下示例使用 Docker 中的 Postgres 与 Redis：

```powershell
.\.venv\Scripts\Activate.ps1
$env:FLASK_APP="superset.app:create_app()"
$env:FLASK_DEBUG="1"
$env:SUPERSET_CONFIG_PATH="D:\data\PycharmProjects\superset\docker\pythonpath_dev\superset_config.py"
$env:SUPERSET_SECRET_KEY="replace_with_a_fixed_local_secret"
$env:SUPERSET__SQLALCHEMY_DATABASE_URI="postgresql+psycopg2://superset:superset@127.0.0.1:5432/superset"
$env:REDIS_HOST="127.0.0.1"
$env:REDIS_PORT="6379"
$env:REDIS_CELERY_DB="0"
$env:REDIS_RESULTS_DB="1"
```

首次运行或元数据库有迁移时：

```powershell
superset db upgrade
superset fab create-admin --username admin --firstname Superset --lastname Admin --email admin@superset.com --password admin
superset init
```

启动本机后端：

```powershell
python -m flask run -p 8088 --reload --host 0.0.0.0
```

也可直接调用 Superset CLI：

```powershell
.\.venv\Scripts\superset.exe run -p 8088 --with-threads --reload --debugger --debug
```

若元数据库 URI 使用 `mysql+mysqlconnector://...`，请在本机虚拟环境安装驱动：

```powershell
.\.venv\Scripts\python.exe -m pip install mysql-connector-python
```

注意：本机后端必须监听 `0.0.0.0:8088`，使 Docker 容器可以通过 `host.docker.internal:8088` 访问。使用 Docker 中的 Postgres 与 Redis 时，需保持 `db` 和 `redis` 服务运行。

切回“后端也在 Docker 中”模式：

```powershell
docker compose -f docker-compose.yml -f docker-compose.backend-local.yml --profile backend-in-docker up -d
```

### PyCharm 配置

新建 PyCharm 的 `Python` Run/Debug Configuration：

| 字段 | 值 |
| --- | --- |
| Python interpreter | `D:\data\PycharmProjects\superset\.venv\Scripts\python.exe` |
| Run mode | `Module name` |
| Module name | `flask` |
| Parameters | `run -p 8088 --reload --host 0.0.0.0` |
| Working directory | 项目根目录 |

将上一节的环境变量加入该运行配置，至少包含 `FLASK_APP`、`SUPERSET_CONFIG_PATH`、`SUPERSET_SECRET_KEY`、`SUPERSET__SQLALCHEMY_DATABASE_URI` 和 Redis 配置。

不要将 `superset` 设为 `Module name`。这会执行 `python -m superset`，但该包没有 `__main__.py`，会报错：

```text
No module named superset.__main__; 'superset' is a package and cannot be directly executed
```

## Windows 依赖：python-ldap

Superset 的 `development` 依赖需要 `python-ldap>=3.4.7`。PyPI 未提供适用于 CPython 3.11 x64 的 Windows wheel，`pip` 会尝试从源码编译。出现以下错误说明编译环境缺少 OpenLDAP 开发头文件：

```text
fatal error C1083: 无法打开包括文件: “lber.h”: No such file or directory
```

`D:\app\OpenLDAP-2.6.9` 只含 OpenLDAP 运行时和服务端文件，不含 `include\lber.h`、`include\ldap.h` 与编译所需 `.lib` 文件，不能直接用于编译 `python-ldap`。

本机使用第三方非官方 Windows wheel：公开仓库 [lv5kakita/python-ldap-build](https://github.com/lv5kakita/python-ldap-build) 的 [GitHub Actions run 28920160802](https://github.com/lv5kakita/python-ldap-build/actions/runs/28920160802) AMD64 artifact。该 job 的构建与 `import ldap` 测试成功；整个 workflow 失败源自无关 ARM64 job。

下载 AMD64 artifact：

```powershell
$artifactDir = Join-Path $env:TEMP "python-ldap-3.4.7-wheels"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$artifactZip = Join-Path $artifactDir "wheels-win-amd64.zip"

curl.exe -fL `
  "https://nightly.link/lv5kakita/python-ldap-build/actions/runs/28920160802/wheels-win-amd64.zip" `
  -o $artifactZip

tar.exe -xf $artifactZip -C $artifactDir
```

安装前校验 CPython 3.11 x64 wheel。已验证 SHA-256：`411CACAC657771C12F37B05639EA59BE6ED0614D7ED41F94C33B5F5A7CE1896B`。

```powershell
$wheel = Join-Path $artifactDir "python_ldap-3.4.7-cp311-cp311-win_amd64.whl"
Get-FileHash -Algorithm SHA256 $wheel
```

校验值匹配后，安装并验证：

```powershell
.\.venv\Scripts\python.exe -m pip install --no-deps $wheel
.\.venv\Scripts\python.exe -c "import ldap, _ldap; print(ldap.__version__); print(_ldap.__file__); print(ldap.get_option(ldap.OPT_API_INFO))"
.\.venv\Scripts\python.exe -m pip show python-ldap
.\.venv\Scripts\python.exe -m pip check
```

预期 `ldap.__version__` 为 `3.4.7`，`_ldap` 位于 `.venv\Lib\site-packages\_ldap.cp311-win_amd64.pyd`，并且 `pip check` 输出 `No broken requirements found.`。

## 常见问题

### SECRET_KEY 与已有元数据

元数据库初始化后，`SUPERSET_SECRET_KEY` 必须保持稳定。Superset 使用该值加密元数据库中的数据库连接信息。

如果启动时出现：

```text
ValueError: The length of the provided data is not a multiple of the block length.
```

通常表示 Superset 正在使用错误的 key 解密已有元数据，或元数据库中的加密字段已经损坏。

全新测试部署可以重建元数据库：

```sql
DROP DATABASE superset;
CREATE DATABASE superset DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON superset.* TO 'superset'@'%';
FLUSH PRIVILEGES;
```

已有部署必须继续使用原来的 `SUPERSET_SECRET_KEY`。若需更换 key，按 Superset 密钥轮换流程，将旧 key 配置为 `PREVIOUS_SECRET_KEY`。

## 部署到其他服务器

可选择推送镜像到镜像仓库，或导出为 tar 包传输。

推送到镜像仓库：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker tag superset-superset:latest your-registry/superset:custom
docker push your-registry/superset:custom
```

导出 tar 包：

```powershell
docker save superset-superset:latest -o superset-custom.tar
```

目标服务器加载并启动：

```bash
docker load -i superset-custom.tar
docker compose run --rm superset-init
docker compose up -d
```

在目标服务器通过环境变量或 `.env` 文件配置：

```env
SUPERSET_SECRET_KEY=replace_with_the_same_fixed_secret
SUPERSET__SQLALCHEMY_DATABASE_URI=mysql://superset:password@mysql-host:3306/superset
```
