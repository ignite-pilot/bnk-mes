import { useRef, useCallback } from 'react';

/**
 * 마우스 드래그(그랩)으로 스크롤 가능한 컨테이너용 훅
 * 반환: { ref, props } → 대상 div에 펼침
 * 버튼/입력/링크 등 인터랙티브 요소 위에서는 드래그 비활성화
 */
export default function useGrabScroll({ axis = 'x' } = {}) {
  const ref = useRef(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;
    const el = ref.current; if (!el) return;
    drag.current = { active: true, startX: e.pageX, startY: e.pageY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e) => {
    const d = drag.current; if (!d.active) return;
    const el = ref.current; if (!el) return;
    if (axis !== 'y') {
      const dx = e.pageX - d.startX;
      el.scrollLeft = d.scrollLeft - dx;
    }
    if (axis === 'y' || axis === 'both') {
      const dy = e.pageY - d.startY;
      el.scrollTop = d.scrollTop - dy;
    }
  }, [axis]);

  const end = useCallback(() => {
    const el = ref.current; if (!el) return;
    drag.current.active = false;
    el.style.cursor = '';
    el.style.userSelect = '';
  }, []);

  return {
    ref,
    props: { onMouseDown, onMouseMove, onMouseUp: end, onMouseLeave: end },
  };
}
