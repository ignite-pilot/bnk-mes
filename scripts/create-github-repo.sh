#!/bin/sh
# GitHub 저장소 생성 (토큰 입력으로 한 번에 실행)
# AWS Secret Manager prod/ignite-pilot/github 에서 토큰 확인 후 실행

cd "$(dirname "$0")/.." || exit 1

if [ -z "$GITHUB_TOKEN" ]; then
  echo "GitHub Personal Access Token이 필요합니다."
  echo "AWS Secret Manager 'prod/ignite-pilot/github'에서 확인하세요."
  printf "GITHUB_TOKEN 입력: "
  read -r GITHUB_TOKEN
  export GITHUB_TOKEN
  echo ""
fi

node scripts/create-github-repo.js
