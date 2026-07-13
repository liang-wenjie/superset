# Superset Docker 本地部署笔记

本文记录当前工作区使用 Docker 部署 Superset 的流程和排查要点。

## Compose 文件选择

- `docker-compose.yml`：用于源码开发，挂载本地源码，支持前端热更新。
- `docker-compose-non-dev.yml`：用于把当前源码构建进镜像，再按部署方式运行。

本地构建镜像部署时使用：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml up -d
```

## MySQL 元数据库配置

元数据库配置放在 `docker/.env-local`。建议使用 Superset 的最终覆盖变量，不要通过修改 `DATABASE_DIALECT` 来切换元数据库。

推荐配置：

```env
SUPERSET_LOAD_EXAMPLES=no
SUPERSET_SECRET_KEY=replace_with_a_fixed_strong_secret
SUPERSET__SQLALCHEMY_DATABASE_URI=mysql://superset:password@192.168.0.231:3306/superset

SUPERSET_PORT=8088
REDIS_PORT=6379
```

在这个 compose 配置中，不建议用下面这组变量配置元数据库：

```env
DATABASE_DIALECT=mysql
DATABASE_HOST=192.168.0.231
DATABASE_PORT=3306
DATABASE_DB=superset
DATABASE_USER=superset
DATABASE_PASSWORD=password
```

原因是 `docker/pythonpath_dev/superset_config.py` 会使用 `DATABASE_DIALECT` 同时拼接 `SQLALCHEMY_DATABASE_URI` 和 `SQLALCHEMY_EXAMPLES_URI`。如果把 `DATABASE_DIALECT` 改成 `mysql`，示例数据加载流程也可能使用 MySQL 驱动去连接 compose 里的 Postgres 服务，导致 handshake 失败。

如果使用 `mysql://...`，镜像里需要安装 `mysqlclient`。如果使用 `mysql+mysqlconnector://...`，镜像里需要安装 `mysql-connector-python`。

把驱动写入：

```text
docker/requirements-local.txt
```

例如：

```text
mysqlclient
```

然后重新构建：

```powershell
docker compose -f docker-compose-non-dev.yml build
```

## 端口设置

使用 `docker-compose-non-dev.yml` 时，保持：

```env
SUPERSET_PORT=8088
REDIS_PORT=6379
```

不要在原始 `docker-compose-non-dev.yml` 下设置 `SUPERSET_PORT=8089`。该 compose 文件把宿主机 `8088` 映射到容器内 `8088`。如果 Gunicorn 在容器内监听 `8089`，访问 `http://localhost:8088` 会出现空响应。

验证服务健康状态：

```powershell
curl.exe http://localhost:8088/health
```

预期输出：

```text
OK
```

## 初始化

`superset-init` 服务应该运行完成并正常退出：

```text
superset_init  Exited (0)
```

手动执行初始化：

```powershell
docker compose -f docker-compose-non-dev.yml run --rm superset-init
```

启动服务：

```powershell
docker compose -f docker-compose-non-dev.yml up -d
```

查看容器状态：

```powershell
docker compose -f docker-compose-non-dev.yml ps -a
```

查看日志：

```powershell
docker compose -f docker-compose-non-dev.yml logs --tail=300 superset
docker compose -f docker-compose-non-dev.yml logs --tail=300 superset-init
```

## SECRET_KEY 和已有元数据

`SUPERSET_SECRET_KEY` 在元数据库初始化后必须保持稳定。Superset 会用这个 key 加密元数据库里的数据库连接信息。

如果启动时出现类似错误：

```text
ValueError: The length of the provided data is not a multiple of the block length.
```

说明 Superset 正在用错误的 key 解密已有元数据，或者元数据库里的加密字段已经损坏。

如果是全新测试部署，可以重建元数据库：

```sql
DROP DATABASE superset;
CREATE DATABASE superset DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON superset.* TO 'superset'@'%';
FLUSH PRIVILEGES;
```

如果是已有部署，需要继续使用原来的 `SUPERSET_SECRET_KEY`。如果要更换 key，需要按 Superset 的密钥轮换流程，把旧 key 配成 `PREVIOUS_SECRET_KEY`。

## 代码更新后如何更新容器

不需要每修改一点代码都执行完整构建。是否需要重新构建，取决于改动内容和使用的 Compose 文件。

`docker-compose-non-dev.yml` 会把后端、前端源码和依赖构建进镜像，因此修改这些内容后，需要重新构建相关镜像并重启容器：

- Python 后端源码
- React/TypeScript 前端源码
- Python、Node.js 或系统依赖
- Dockerfile 或镜像构建配置

可以构建并启动所有受影响的服务：

```powershell
docker compose -f docker-compose-non-dev.yml up -d --build
```

也可以分开执行：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml up -d
```

如果只需要更新 Superset 应用镜像，可以只构建并启动对应服务，避免构建全部镜像：

```powershell
docker compose -f docker-compose-non-dev.yml build superset
docker compose -f docker-compose-non-dev.yml up -d superset
```

Docker 会复用构建缓存，但修改前端依赖或影响较早的镜像层时，构建仍可能耗时较长。

如果更新包含数据库迁移，构建后执行初始化：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml run --rm superset-init
docker compose -f docker-compose-non-dev.yml up -d
```

以下改动通常不需要重新构建镜像：

- 只修改通过 volume 挂载的配置文件
- 只修改 `.env-local` 等运行时环境变量
- 只修改文档、测试或未被镜像使用的文件

修改运行时配置后，通常重新创建容器即可：

```powershell
docker compose -f docker-compose-non-dev.yml up -d
```

如果配置由容器重启时重新读取，也可以执行：

```powershell
docker compose -f docker-compose-non-dev.yml restart
```

日常频繁开发建议使用 `docker-compose.yml`。它会挂载本地源码并支持前端热更新，通常不需要在每次代码修改后重新构建镜像。

## Windows 安装 python-ldap

Superset 的 `development` 依赖要求 `python-ldap>=3.4.7`。PyPI 没有提供适用于 CPython 3.11 x64 的 Windows wheel，因此 `pip` 会尝试从源码编译。出现下列错误时，说明编译环境缺少 OpenLDAP 开发头文件：

```text
fatal error C1083: 无法打开包括文件: “lber.h”: No such file or directory
```

`D:\app\OpenLDAP-2.6.9` 只包含 OpenLDAP 运行时和服务端文件，不包含 `include\lber.h`、`include\ldap.h` 和编译所需的 `.lib` 文件，不能直接用于编译 `python-ldap`。

当前本机环境使用公开仓库 [lv5kakita/python-ldap-build](https://github.com/lv5kakita/python-ldap-build) 在 [GitHub Actions run 28920160802](https://github.com/lv5kakita/python-ldap-build/actions/runs/28920160802) 中构建的 AMD64 artifact。AMD64 job 的构建和 `import ldap` 测试均成功；整个 workflow 显示失败是因为无关的 ARM64 job 失败。这是第三方非官方 Windows wheel，不是 PyPI 发布物。

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

安装前校验 CPython 3.11 x64 wheel。已验证的 SHA-256 为 `411CACAC657771C12F37B05639EA59BE6ED0614D7ED41F94C33B5F5A7CE1896B`：

```powershell
$wheel = Join-Path $artifactDir "python_ldap-3.4.7-cp311-cp311-win_amd64.whl"
Get-FileHash -Algorithm SHA256 $wheel
```

校验值匹配后安装到项目虚拟环境：

```powershell
.\.venv\Scripts\python.exe -m pip install --no-deps $wheel
```

验证 Python 包、底层扩展模块和依赖一致性：

```powershell
.\.venv\Scripts\python.exe -c "import ldap, _ldap; print(ldap.__version__); print(_ldap.__file__); print(ldap.get_option(ldap.OPT_API_INFO))"
.\.venv\Scripts\python.exe -m pip show python-ldap
.\.venv\Scripts\python.exe -m pip check
```

预期 `ldap.__version__` 输出 `3.4.7`，`_ldap` 路径指向 `.venv\Lib\site-packages\_ldap.cp311-win_amd64.pyd`，并且 `pip check` 输出 `No broken requirements found.`。

## 前端走 Docker，后端走本机

如果希望保留 Docker 中的前端开发环境，同时在宿主机单独启动 Superset 后端，可以使用：

```text
docker-compose.backend-local.yml
```

这个覆盖文件会做两件事：

- 把 `superset-node` 的后端地址改成 `http://host.docker.internal:8089`
- 把 Docker 里的 `superset`、`superset-init`、`superset-worker`、`superset-worker-beat` 放进 `backend-in-docker` profile，默认 `up` 时不会启动

只进行前端开发时，只需启动前端开发容器：

```powershell
docker compose -f docker-compose.yml -f docker-compose.backend-local.yml up -d superset-node
```

前端开发服务器访问地址为：

```text
http://localhost:9002
```

这里使用宿主机 `9002` 映射容器内 Webpack 的 `9000`，以避免与其他服务占用的
宿主机 `9000` 和 `9001` 冲突。前端 API 请求会代理到本机后端的 `8089`。

宿主机后端连接 Docker 中的 Postgres 和 Redis 时，先设置环境变量：

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

首次运行或元数据库有迁移时，执行：

```powershell
superset db upgrade
superset fab create-admin --username admin --firstname Superset --lastname Admin --email admin@superset.com --password admin
superset init
```

然后在宿主机单独启动后端：

```powershell
python -m flask run -p 8089 --reload --host 0.0.0.0
```

### PyCharm 启动配置

在 PyCharm 中创建 `Python` Run/Debug Configuration，使用项目虚拟环境：

```text
D:\data\PycharmProjects\superset\.venv\Scripts\python.exe
```

选择 `Module name`，填写 `flask`，参数填写：

```text
run -p 8089 --reload --host 0.0.0.0
```

工作目录设为项目根目录，并将上一节的环境变量添加到该运行配置中，至少包括
`FLASK_APP=superset.app:create_app()`、`SUPERSET_CONFIG_PATH`、
`SUPERSET_SECRET_KEY`、`SUPERSET__SQLALCHEMY_DATABASE_URI` 和 Redis 配置。

不要把 `superset` 填入 `Module name`。这会执行 `python -m superset`，但
`superset` 包不提供 `__main__.py`，会报：

```text
No module named superset.__main__; 'superset' is a package and cannot be directly executed
```

不使用 PyCharm 调试器时，也可以直接调用 Superset CLI：

```powershell
.\.venv\Scripts\superset.exe run -p 8089 --with-threads --reload --debugger --debug
```

如果元数据库 URI 使用 `mysql+mysqlconnector://...`，需在本机虚拟环境安装对应驱动：

```powershell
.\.venv\Scripts\python.exe -m pip install mysql-connector-python
```

访问前端开发服务器：

```text
http://localhost:9002
```

注意事项：

- 本机后端需要监听 `0.0.0.0:8089`，这样容器内的 `host.docker.internal:8089` 才能访问到它
- 如果本机后端使用 Docker 中的 Postgres/Redis，需要保持 `db` 和 `redis` 服务已启动
- 如果要切回“后端也跑在 Docker 中”的模式，需要显式启用 profile：

```powershell
docker compose -f docker-compose.yml -f docker-compose.backend-local.yml --profile backend-in-docker up -d
```

## 部署到其他服务器

可以在本地构建镜像后推送到镜像仓库，或者导出为 tar 包再传到服务器。

镜像仓库流程：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker tag superset-superset:latest your-registry/superset:custom
docker push your-registry/superset:custom
```

tar 包流程：

```powershell
docker save superset-superset:latest -o superset-custom.tar
```

在目标服务器上：

```bash
docker load -i superset-custom.tar
docker compose run --rm superset-init
docker compose up -d
```

目标服务器上使用环境变量或 `.env` 文件配置：

```env
SUPERSET_SECRET_KEY=replace_with_the_same_fixed_secret
SUPERSET__SQLALCHEMY_DATABASE_URI=mysql://superset:password@mysql-host:3306/superset
```
