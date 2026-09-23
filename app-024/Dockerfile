# 多阶段构建：node:20-alpine 构建 → nginx:1.27-alpine 运行
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine-slim
# nginx.conf 不进构建上下文（.dockerignore 排除），由 compose 以只读卷挂载
COPY --from=build /app/dist /usr/share/nginx/html
# 断网可用：无外部依赖；中文字体走系统字体栈，无外部请求
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
