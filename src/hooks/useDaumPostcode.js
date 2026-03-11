/**
 * Daum(카카오) 주소 검색 팝업 훅
 * - 스크립트 동적 로드 후 주소 검색 창 오픈
 * - onComplete(data): data.zonecode(우편번호), data.roadAddress(도로명), data.jibunAddress(지번), data.address
 */
import { useCallback } from 'react';

const DAUM_SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Daum postcode script load failed'));
    document.head.appendChild(script);
  });
}

export function useDaumPostcode() {
  const open = useCallback((onComplete) => {
    loadScript(DAUM_SCRIPT_URL)
      .then(() => {
        if (typeof window.daum === 'undefined' || !window.daum.Postcode) {
          onComplete({ error: '주소 검색을 불러올 수 없습니다.' });
          return;
        }
        new window.daum.Postcode({
          oncomplete(data) {
            onComplete({
              zonecode: data.zonecode || '',
              address: data.roadAddress || data.jibunAddress || data.address || '',
            });
          },
          onclose() {},
        }).open();
      })
      .catch(() => {
        if (typeof onComplete === 'function') {
          onComplete({ error: '주소 검색 스크립트를 불러오지 못했습니다.' });
        }
      });
  }, []);

  return open;
}
