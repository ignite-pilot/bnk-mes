/**
 * 설정(ig-config-manager) 코드 불러오기 공용 훅
 * - VEHICLE_CODE, PART_CODE, COLOR_CODE 등을 SelectDropdown 옵션 형태로 반환
 */
import { useEffect, useState } from 'react';

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) => (d.items || d.list || []).map((c) => ({
      value: c.codeValue || c.value || c.code,
      label: c.label || c.codeName || c.name || c.codeValue,
      name: c.name || c.codeName || c.label || '',
    })))
    .catch(() => []);

export function useConfigCodes() {
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
    fetchCode('COLOR_CODE').then(setColorCodes);
  }, []);

  return { vehicleCodes, partCodes, colorCodes };
}

export { fetchCode };
