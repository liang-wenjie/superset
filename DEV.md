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

`docker-compose-non-dev.yml` 会把源码构建进镜像。代码更新后执行：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml up -d
```

如果更新包含数据库迁移，执行：

```powershell
docker compose -f docker-compose-non-dev.yml build
docker compose -f docker-compose-non-dev.yml run --rm superset-init
docker compose -f docker-compose-non-dev.yml up -d
```

如果只是修改了 `.env-local`，通常不需要重新构建：

```powershell
docker compose -f docker-compose-non-dev.yml up -d
```

或者：

```powershell
docker compose -f docker-compose-non-dev.yml restart
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
