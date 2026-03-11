import { useState, useEffect } from 'react';

/**
 * 미디어 쿼리 매칭 여부 (창 크기 변경 시 리사이즈 반영)
 * @param {string} query - CSS media query (예: '(max-width: 767px)')
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** 모바일 뷰포트 (768px 미만) */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

/** 태블릿 이하 (1024px 미만) */
export function useIsTabletOrMobile() {
  return useMediaQuery('(max-width: 1023px)');
}
