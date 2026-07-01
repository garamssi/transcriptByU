# Claude Code 프록시 서버 이미지
# 호스트 node v22.19.0 과 맞춰 node 22 사용
FROM node:22-slim

# claude CLI 가 참조하는 기본 도구들
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 컨테이너 안에 claude CLI 설치 (Linux 빌드)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# 프록시 서버 소스 (node 내장 모듈만 사용하므로 별도 npm install 불필요)
COPY proxy-server/ ./proxy-server/
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# claude 인증/설정은 실행 시 볼륨으로 마운트 (아래 run.command 참고)
#   /root/.claude/.credentials.json  <- 호스트 Keychain 에서 추출한 OAuth 토큰
ENV HOME=/root
ENV PORT=3456

EXPOSE 3456

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "proxy-server/server.js"]