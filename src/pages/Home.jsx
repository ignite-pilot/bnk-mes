import React from 'react';
import { Link } from 'react-router-dom';
import { menuConfig } from '../config/menu';
import { useAuth } from '../context/AuthContext';
import styles from './Home.module.css';

function Home() {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>BNK MES - 생산 관리 시스템</h1>
      {isAuthenticated && user && (
        <p className={styles.welcome}>
          {user.name || user.loginId}님, 환영합니다.
        </p>
      )}
      <p className={styles.desc}>
        상단 메뉴에서 원하는 기능을 선택하세요.
      </p>
      <ul className={styles.menuList}>
        {menuConfig.map((group) => (
          <li key={group.id}>
            <span className={styles.groupName}>{group.label}</span>
            <ul>
              {group.children.map((child) => (
                <li key={child.id}>
                  <Link to={child.path}>{child.label}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Home;
