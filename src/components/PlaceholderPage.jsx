import React from 'react';
import styles from './PlaceholderPage.module.css';

function PlaceholderPage({ title }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.desc}>이 화면은 준비 중입니다.</p>
    </div>
  );
}

export default PlaceholderPage;
