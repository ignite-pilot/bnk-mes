import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRegisterRedirectUrl } from '../config/member';
import styles from './Auth.module.css';

function Login() {
  const { isAuthenticated, loading, setAuthFromCallback } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }
      setAuthFromCallback(data.token, data.user);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError('로그인 요청 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>로그인</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <label className={styles.label}>
            이메일 (아이디)
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className={styles.input}
              autoComplete="username"
              required
            />
          </label>
          <label className={styles.label}>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className={styles.button} disabled={submitting}>
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className={styles.footer}>
          계정이 없으신가요? <a href={getRegisterRedirectUrl()}>회원가입</a>
        </p>
      </div>
    </div>
  );
}

export default Login;
