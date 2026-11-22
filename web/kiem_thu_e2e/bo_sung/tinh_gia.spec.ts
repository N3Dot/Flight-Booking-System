// Bổ sung kiểm định tĩnh (checklist mục 10): giao diện làm tròn giá tiền của hạng đúng như máy chủ.
// Ca thuần hàm, không mở trình duyệt, không đụng cơ sở dữ liệu.
import { expect, test } from '@playwright/test';
import { giaTienTheoHang } from '../../src/tien_ich/dinh_dang';

test('Checklist mục 10: giá tiền của hạng làm tròn nửa lên như HangVe.tinhGiaTien, kể cả giá trị đúng nửa', () => {
  // 125 x 129,2% = 161,5 và 1.250 x 2,28% = 28,5: máy chủ làm tròn thành 162 và 29
  expect(giaTienTheoHang(125, 129.2)).toBe(162);
  expect(giaTienTheoHang(1250, 2.28)).toBe(29);
  expect(giaTienTheoHang(1_500_000, 105)).toBe(1_575_000);
  // giá vé lớn nhất của Hạng 1 (105%) vẫn tính đúng, không mất chữ số
  expect(giaTienTheoHang(952_380_952_380, 105)).toBe(999_999_999_999);
});
