import React from 'react';
import styles from './Footer.module.css';

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>BNK MES - 생산 관리 시스템</span>
        <span>© {year} BNS</span>
      </div>
    </footer>
  );
}

export default Footer;
