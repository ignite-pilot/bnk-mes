import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthFromCallback } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const message = searchParams.get('message');

    if (errorParam) {
      setError(message || '로그인에 실패했습니다.');
      return;
    }

    if (!code) {
      setError('인증 코드가 없습니다.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/member/auth/token/${encodeURIComponent(code)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || '토큰 조회에 실패했습니다.');
          return;
        }
        setAuthFromCallback(data.token, data.user);
        navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) setError('인증 처리 중 오류가 발생했습니다.');
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, setAuthFromCallback, navigate]);

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>로그인 실패</h1>
          <p className={styles.error}>{error}</p>
          <a href="/login" className={styles.button} style={{ display: 'inline-block', textAlign: 'center' }}>
            로그인으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.title}>로그인 처리 중...</div>
        <p style={{ textAlign: 'center', color: '#64748b' }}>잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}

export default AuthCallback;
