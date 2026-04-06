#!/bin/bash

# 터미널 타이틀 설정
echo -ne "\033]0;Claude Code Proxy Server\007"

cd /Users/rami/00_Study/udemy_translation/extention

# 기존 프록시 서버 종료
if lsof -ti:3456 > /dev/null 2>&1; then
  echo "기존 프록시 서버 종료 중..."
  kill $(lsof -ti:3456) 2>/dev/null
  sleep 1
fi

echo "========================================"
echo "  Claude Code 프록시 서버"
echo "  종료하려면 Ctrl+C 또는 터미널 닫기"
echo "========================================"
echo ""

node proxy-server/server.js

# 서버가 종료되어도 터미널 유지
echo ""
echo "========================================"
echo "  서버가 종료되었습니다."
echo "  아무 키나 누르면 터미널을 닫습니다."
echo "========================================"
read -n 1 -s
