---
name: select-dropdown
description: SelectDropdown 커스텀 드롭다운 컴포넌트 사용 가이드. 드롭다운/셀렉트 UI를 만들거나 수정할 때 자동 참고. 기본 select 태그 대신 항상 이 컴포넌트를 사용해야 함.
user-invocable: false
paths: src/**/*.jsx, src/**/*.tsx
---

# SelectDropdown 컴포넌트 사용 규칙

## 핵심 규칙
- **기본 `<select>` 태그 사용 금지**. 항상 `SelectDropdown` 컴포넌트를 사용할 것.
- 위치: `src/components/SelectDropdown.jsx`

## Import
```jsx
import SelectDropdown from '../../components/SelectDropdown';
```

## Props
| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `options` | `{ value, label }[]` | `[]` | 선택 항목 목록 |
| `value` | `string \| string[]` | - | 선택 값 (다중 선택 시 배열) |
| `onChange` | `(value) => void` | - | 변경 콜백 (다중 선택 시 배열 전달) |
| `placeholder` | `string` | `'선택'` | 미선택 시 표시 텍스트 |
| `searchable` | `boolean` | auto | 검색 가능 여부 (옵션 6개 이상이면 자동 true) |
| `disabled` | `boolean` | `false` | 비활성 |
| `maxSelect` | `number` | `1` | 최대 선택 개수 (2 이상 = 체크박스 다중 선택) |
| `style` | `object` | - | wrapper 스타일 (trigger 크기 제어) |
| `triggerStyle` | `object` | - | trigger 버튼 직접 스타일링 |
| `dropdownMinWidth` | `number` | - | 드롭다운 패널 최소 너비 (trigger보다 넓게 열기) |

## 기본 사용법
```jsx
<SelectDropdown
  options={[{ value: 'key1', label: '표시 텍스트' }]}
  value={selectedValue}
  onChange={(val) => setValue(val)}
  placeholder="선택"
/>
```

## ig-config-manager 코드 연동 패턴
```js
const CODES_API = '/api/delivery-vehicles/codes';

const fetchCode = (code) => fetch(`${CODES_API}/${code}`)
  .then(r => r.json())
  .then(d => (d.items || d.list || []).map(c => ({
    value: c.codeValue || c.value || c.code,
    label: c.label || c.codeName || c.name || c.codeValue,
    name: c.name || c.codeName || c.label || '',
  })))
  .catch(() => []);

// 사용 가능 코드: VEHICLE_CODE, PART_CODE, COLOR_CODE, RAW_MATERIAL_TYPE
```

## 색상 드롭다운 (코드+이름 동시 저장)
```jsx
<SelectDropdown
  options={colorCodes.map(c => ({ value: c.value, label: `${c.name} (${c.value})` }))}
  value={formData.color_code}
  onChange={(val) => {
    const found = colorCodes.find(c => c.value === val);
    setFormData(f => ({ ...f, color_code: val, color_name: found?.name || '' }));
  }}
  placeholder="색상 선택"
/>
```

## 다중 선택
```jsx
<SelectDropdown
  options={options}
  value={selectedArray}
  onChange={(vals) => setSelected(vals)}
  maxSelect={5}
  placeholder="최대 5개 선택"
/>
```

## trigger와 드롭다운 너비 분리
```jsx
<SelectDropdown
  style={{ minWidth: 70 }}        // trigger 너비 (좁게)
  dropdownMinWidth={210}          // 드롭다운 패널 최소 너비 (넓게)
/>
```

## 재고 테이블 너비 기준
- 종류: `minWidth: 140`, `dropdownMinWidth: 140`
- 차종: `minWidth: 120`, `dropdownMinWidth: 180`
- 적용부: `minWidth: 210`, `dropdownMinWidth: 210`
- 색상: `minWidth: 120`, `dropdownMinWidth: 180`
- 숫자 입력 (두께/폭/수량): `width: 40`, `type="number"`, `min="0"`

## 특성
- `createPortal`로 body에 렌더링 → 모달/오버플로우 안에서도 정상 동작
- 키보드 네비게이션 지원 (ArrowUp/Down, Enter, Escape)
- 스크롤/리사이즈 시 위치 자동 업데이트
