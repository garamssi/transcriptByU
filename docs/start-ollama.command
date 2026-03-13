#!/bin/bash
echo "기존 Ollama 종료 중..."
pkill ollama 2>/dev/null
sleep 1
echo "Ollama 시작됨!! (터미널 닫으면 종료됩니다)"
OLLAMA_ORIGINS="*" ollama serve