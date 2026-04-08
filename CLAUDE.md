# BNK MES 프로젝트 규칙

## 드롭다운 컴포넌트
- 기본 `<select>` 태그 사용 금지. **항상 `SelectDropdown` 컴포넌트를 사용할 것.**
- 위치: `src/components/SelectDropdown.jsx`
- import: `import SelectDropdown from '../../components/SelectDropdown';`

### SelectDropdown 주요 Props
```
options       - { value, label }[] 형태
value         - string (단일) 또는 string[] (다중)
onChange      - (value) => void
placeholder   - 미선택 시 표시 텍스트 (기본: '선택')
searchable    - 검색 가능 여부 (옵션 6개 이상이면 자동 true)
disabled      - 비활성
maxSelect     - 최대 선택 개수 (2 이상이면 체크박스 다중 선택 모드)
style         - wrapper 스타일 (trigger 크기 제어용)
triggerStyle  - trigger 버튼 직접 스타일링
dropdownMinWidth - 드롭다운 패널 최소 너비 (trigger보다 넓게 열기 가능)
```

### ig-config-manager 코드 연동 패턴
```js
const fetchCode = (code) => fetch(`/api/delivery-vehicles/codes/${code}`)
  .then(r => r.json())
  .then(d => (d.items || d.list || []).map(c => ({
    value: c.codeValue || c.value || c.code,
    label: c.label || c.codeName || c.name || c.codeValue,
    name: c.name || c.codeName || c.label || '',
  })))
  .catch(() => []);

// 사용 가능 코드: VEHICLE_CODE, PART_CODE, COLOR_CODE, RAW_MATERIAL_TYPE
```

### 색상 드롭다운 (코드+이름 동시 저장 패턴)
```jsx
<SelectDropdown
  options={colorCodes.map(c => ({ value: c.value, label: `${c.name} (${c.value})` }))}
  value={formData.color_code}
  onChange={(val) => {
    const found = colorCodes.find(c => c.value === val);
    setFormData(f => ({ ...f, color_code: val, color_name: found?.name || '' }));
  }}
/>
```



### 재고 테이블 너비 기준
- 종류: `minWidth: 140`, `dropdownMinWidth: 140`
- 차종: `minWidth: 120`, `dropdownMinWidth: 180`
- 적용부: `minWidth: 210`, `dropdownMinWidth: 210`
- 색상: `minWidth: 120`, `dropdownMinWidth: 180`
- 숫자 입력 (두께/폭/수량): `width: 40`

## 숫자 입력
- `type="number"` 사용 시 반드시 `min="0"` 설정 (음수 불가)

## 프로젝트 스택
- React 18 + Vite 5 + Express 4 + MySQL
- CSS Modules: `src/pages/material/MaterialInfo.module.css` 공용
- 소프트 삭제 패턴: `deleted CHAR(1) 'N'/'Y'`
