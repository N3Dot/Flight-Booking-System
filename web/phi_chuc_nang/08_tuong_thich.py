"""Đọc và điền tập tin Excel, PDF bằng thư viện độc lập với phần mềm (openpyxl, pypdf) cho 08_tuong_thich.ps1.

Cách dùng:
  python -I 08_tuong_thich.py dien <mau.xlsx> <ra.xlsx> <ma1> <ma2> <ma3> <dd/MM/yyyy HH:mm>
  python -I 08_tuong_thich.py excel <tep.xlsx>
  python -I 08_tuong_thich.py pdf <tep.pdf>
Kết quả in ra dạng JSON.
"""
import json
import re
import sys

import openpyxl
from pypdf import PdfReader

CO_DAU = re.compile('[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]', re.IGNORECASE)


def tieu_de(ws):
    return [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]


def dien(mau, ra, ma1, ma2, ma3, ngay):
    wb = openpyxl.load_workbook(mau)
    cb, tg = wb['ChuyenBay'], wb['TrungGian']
    cot_cb, cot_tg = tieu_de(cb), tieu_de(tg)
    so_hang = len(cot_cb) - 6
    # chuyến 1 có 2 sân bay trung gian, chuyến 3 chỉ bay 20 phút nên phải bị từ chối theo QĐ1
    dong = [
        [ma1, '1500000', 'SGN', 'HAN', ngay, '130'] + ['20'] + ['150'] * (so_hang - 1),
        [ma2, '1200000', 'HAN', 'SGN', ngay, '125'] + ['10'] + ['100'] * (so_hang - 1),
        [ma3, '900000', 'SGN', 'DAD', ngay, '20'] + ['10'] + ['50'] * (so_hang - 1),
    ]
    for i, d in enumerate(dong, start=2):
        for j, v in enumerate(d, start=1):
            cb.cell(row=i, column=j, value=v)
    for i, d in enumerate([[ma1, '1', 'DAD', '15', 'Đón khách'], [ma1, '2', 'CXR', '15', 'Dừng kỹ thuật']], start=2):
        for j, v in enumerate(d, start=1):
            tg.cell(row=i, column=j, value=v)
    wb.save(ra)
    return {'trang': wb.sheetnames, 'cotChuyenBay': cot_cb, 'cotTrungGian': cot_tg,
            'huongDan': [r[0] for r in wb['HuongDan'].iter_rows(values_only=True)] if 'HuongDan' in wb.sheetnames else None,
            'daDien': dong}


def excel(tep):
    wb = openpyxl.load_workbook(tep, read_only=True)
    kq = {'trang': []}
    for ws in wb.worksheets:
        rows = [r for r in ws.iter_rows(values_only=True)]
        i_tieu_de = next((i for i, r in enumerate(rows) if r and r[0] in ('STT', 'Tháng')), None)
        du_lieu = rows[i_tieu_de + 1:] if i_tieu_de is not None else []
        du_lieu = [r for r in du_lieu if r and isinstance(r[0], (int, float))]
        ghi_chu = [r[0] for r in rows[:i_tieu_de or 0] if r and isinstance(r[0], str)]
        chu = ' '.join(str(v) for r in rows for v in r if isinstance(v, str))
        kq['trang'].append({
            'ten': ws.title, 'soDong': len(rows), 'dongDau': ghi_chu, 'cot': list(rows[i_tieu_de]) if i_tieu_de is not None else None,
            'soDongDuLieu': len(du_lieu), 'dongDauTien': list(du_lieu[0]) if du_lieu else None,
            'dongCuoi': list(du_lieu[-1]) if du_lieu else None,
            'tongCot3': sum(r[2] for r in du_lieu if len(r) > 2 and isinstance(r[2], (int, float))) if du_lieu else None,
            'tongCot4': sum(r[3] for r in du_lieu if len(r) > 3 and isinstance(r[3], (int, float))) if du_lieu else None,
            'coChuCoDau': bool(CO_DAU.search(chu)),
        })
    return kq


def pdf(tep):
    r = PdfReader(tep)
    hop = r.pages[0].mediabox
    chu = '\n'.join(p.extract_text() or '' for p in r.pages)
    return {'soTrang': len(r.pages), 'khoGiayPt': [float(hop.width), float(hop.height)],
            'laA4': abs(float(hop.width) - 595) < 2 and abs(float(hop.height) - 842) < 2,
            'dongDau': (r.pages[0].extract_text() or '').splitlines()[:5],
            'dongCuoi': chu.splitlines()[-3:], 'coChuCoDau': bool(CO_DAU.search(chu)),
            'soDongDuLieu': sum(1 for d in chu.splitlines() if re.match(r'^\d+ ', d))}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    lenh, *tham_so = sys.argv[1:]
    kq = {'dien': dien, 'excel': excel, 'pdf': pdf}[lenh](*tham_so)
    print(json.dumps(kq, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
