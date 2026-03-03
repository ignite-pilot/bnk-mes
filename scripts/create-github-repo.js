#!/usr/bin/env node
/**
 * GitHub 저장소 생성 스크립트
 * - GITHUB_TOKEN: AWS Secret Manager "prod/ignite-pilot/github" 에서 Personal Access Token 확인
 * - 실행: GITHUB_TOKEN=<token> node scripts/create-github-repo.js
 * - 또는: gh auth login 후 gh repo create bnk-mes --private --source=. --remote=origin --push
 */
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const REPO_NAME = 'bnk-mes';
const token = process.env.GITHUB_TOKEN;

async function createViaApi() {
  if (!token) {
    console.error('GITHUB_TOKEN 환경 변수가 필요합니다.');
    console.error('AWS Secret Manager prod/ignite-pilot/github 에서 토큰을 확인하세요.');
    process.exit(1);
  }
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: REPO_NAME,
      description: 'BNS 생산 관리 시스템 (MES)',
      private: false,
      auto_init: false,
    }),
  });
  if (res.status === 201) {
    const data = await res.json();
    console.log('저장소가 생성되었습니다:', data.html_url);
    return data.clone_url;
  }
  const errText = await res.text();
  if (res.status === 422) {
    let errJson;
    try {
      errJson = JSON.parse(errText);
    } catch {
      errJson = {};
    }
    if (errText.includes('name already exists') || errJson.message?.includes('exists')) {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` },
      });
      const user = userRes.ok ? await userRes.json() : {};
      const login = user.login || process.env.GITHUB_OWNER || 'YOUR_ORG';
      const cloneUrl = `https://github.com/${login}/${REPO_NAME}.git`;
      console.log('저장소가 이미 존재합니다. 원격만 추가합니다.');
      return cloneUrl;
    }
  }
  console.error('생성 실패:', res.status, errText);
  process.exit(1);
}

function getDefaultRemoteUrl() {
  try {
    return execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const gitDir = join(process.cwd(), '.git');
  if (!existsSync(gitDir)) {
    console.log('git init 실행...');
    execSync('git init', { stdio: 'inherit' });
  }

  let cloneUrl = getDefaultRemoteUrl();
  if (!cloneUrl && token) {
    try {
      const url = await createViaApi();
      if (url) {
        try {
          execSync(`git remote add origin ${url}`, { stdio: 'inherit' });
          console.log('원격 origin 추가됨:', url);
        } catch (e) {
          if (e.message && e.message.includes('already exists')) {
            console.log('origin이 이미 있습니다.');
          } else {
            console.log('원격 수동 추가: git remote add origin', url);
          }
        }
        console.log('코드 푸시: git add . && git commit -m "Initial commit" && git branch -M main && git push -u origin main');
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  } else if (!token) {
    console.log('GITHUB_TOKEN 없음. gh CLI 사용: gh auth login 후');
    console.log('  gh repo create bnk-mes --private --source=. --remote=origin --push');
  } else {
    console.log('이미 origin이 설정되어 있습니다:', cloneUrl);
  }
}

main();
