# Udemy AI Translate

Udemy 자막을 번역하는 크롬 확장. "Claude Code" 서비스는 로컬 프록시(`proxy-server/server.js`, 포트 3456)를 거쳐 `claude -p` 를 호출한다.

## "프록시 띄워줘" 요청을 받으면

사용자가 "도커로 claude proxy 띄워줘" 처럼 요청하면 아래 순서로 직접 진행한다(Windows·macOS 공통).
`docker/run.command`, `docker/run.ps1`, `docker/setup-token.*` 는 사람이 쓰는 스크립트다. 입력을 기다리거나 마지막에 `docker logs -f` 로 멈추므로 **직접 실행하지 말고** 아래 명령을 쓴다.

1. **Docker 확인**: `docker info`. 실패하면 Docker Desktop 을 켜 달라고 하고 멈춘다.
2. **이미 떠 있는지 확인**: `docker exec claude-proxy claude -p "ping"` 이 응답하면 정상이다. 5번 확인만 하고 끝낸다. 단, `proxy-server/` 나 `docker/` 가 이미지보다 최신이면 3번부터 다시 한다.
3. **장기 토큰 확인**: `docker/secrets/claude.env` 가 있는지 본다(내용은 읽거나 출력하지 않는다).
   - 없으면 사용자에게 **별도 터미널에서** 토큰 발급 스크립트를 실행해 달라고 한다. 브라우저 로그인과 토큰 붙여넣기가 필요해 대신 실행할 수 없다. 이 스크립트가 발급·저장·컨테이너 실행까지 하므로, 끝났다고 하면 5번으로 간다.
     - macOS: `bash docker/setup-token.command`
     - Windows: `docker\setup-token.bat`
   - 토큰을 채팅에 붙여넣으라고 요청하지 않는다.
4. **빌드·실행** (저장소 루트에서, 토큰 파일이 있을 때):
   ```
   docker build -f docker/Dockerfile -t claude-proxy .
   docker rm -f claude-proxy
   docker run -d --name claude-proxy --restart always -p 3456:3456 --env-file docker/secrets/claude.env claude-proxy
   ```
   `docker rm -f` 는 컨테이너가 없으면 오류를 내는데 무시한다.
5. **확인**: `http://localhost:3456/health` 가 `{"status":"ok"}` 이고 `docker exec claude-proxy claude -p "ping"` 이 응답하면 성공이다. 실패하면 `docker logs --tail 30 claude-proxy` 를 보고 원인을 알린다.

`claude -p "ping"` 이 로그인·만료 관련 문구로 실패하면 토큰이 만료(발급 후 1년)된 것이다. 3번의 발급 스크립트를 다시 실행해 달라고 한다.

## 그 밖에

- 테스트: `node --test tests/*.test.mjs tests/*.test.js proxy-server/claude-invocation.test.js`
- 스토어 업로드용 zip: `./build-extension.sh` (버전은 `manifest.json`). `content.js` 는 `content.src.js` 의 번들이라 직접 고치지 않는다.
