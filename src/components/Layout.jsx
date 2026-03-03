import React, { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { menuConfig } from '../config/menu';
import { useAuth } from '../context/AuthContext';
import Footer from './Footer';
import styles from './Layout.module.css';

function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, isAuthenticated, logout } = useAuth();

  const currentGroup = menuConfig.find(
    (g) =>
      g.path === location.pathname ||
      location.pathname.startsWith(g.path + '/')
  );

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="메뉴 토글"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <Link to="/" className={styles.logo}>
            BNK MES
          </Link>
          <nav className={styles.mainNav}>
            {menuConfig.map((item) => (
              <Link
                key={item.id}
                to={item.children?.[0]?.path ?? item.path}
                className={
                  currentGroup?.id === item.id
                    ? styles.mainNavItemActive
                    : styles.mainNavItem
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.headerAuth}>
            {isAuthenticated ? (
              <>
                <span className={styles.userName}>{user?.name || user?.loginId}</span>
                <button type="button" className={styles.logoutBtn} onClick={logout}>
                  로그아웃
                </button>
              </>
            ) : (
              <Link to="/login" className={styles.loginLink}>
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside
          className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}
        >
          {currentGroup && (
            <nav className={styles.sideNav}>
              <div className={styles.sideNavTitle}>{currentGroup.label}</div>
              <ul className={styles.sideNavList}>
                {currentGroup.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      to={child.path}
                      className={
                        location.pathname === child.path
                          ? styles.sideNavItemActive
                          : styles.sideNavItem
                      }
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default Layout;
