# Ollama 설치 가이드
> Mac M1 기준 | exaone3.5:7.8b 한국어 번역 모델

---

## Step 1. Homebrew 설치 확인

```bash
brew --version
```

설치가 안 되어 있다면:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Step 2. Ollama 설치

```bash
brew install ollama
```

---

## Step 3. 자동 실행 스크립트 생성

바탕화면에 더블클릭용 스크립트 생성:

```bash
cat > ~/Desktop/start-ollama.command << 'EOF'
#!/bin/bash
echo "✅ Ollama 시작됨! (터미널 닫으면 종료됩니다)"
ollama serve
EOF

chmod +x ~/Desktop/start-ollama.command
```

이후 바탕화면의 `start-ollama.command`를 더블클릭하면 Ollama가 실행됩니다.

> ⚠️ 터미널을 닫으면 Ollama도 함께 종료됩니다.

---

## Step 4. 번역 모델 다운로드

새 터미널 창을 열고 실행 (약 5GB, 최초 1회만):

```bash
ollama pull exaone3.5:7.8b
```

---

## Step 5. 번역 테스트

```bash
curl http://localhost:11434/api/generate \
  -d '{
    "model": "exaone3.5:7.8b",
    "prompt": "다음 영어 자막을 한국어로 번역해줘: Hello, welcome to this course.",
    "stream": false
  }'
```

---

## 유용한 명령어

| 명령어 | 설명 |
|--------|------|
| `ollama list` | 설치된 모델 목록 |
| `ollama rm exaone3.5:7.8b` | 모델 제거 |
| `ollama ps` | 현재 실행 중인 모델 확인 |

---

**API 포트:** `http://localhost:11434`