// Hỏi trước khi rời một biểu mẫu đang nhập dở, dùng chung cho biểu mẫu chuyến bay, bán vé, đặt vé
import { useEffect, useRef } from 'react';

/**
 * Đang nhập dở mà bấm liên kết trong trang hoặc nút Back thì hỏi trước khi bỏ dữ liệu;
 * tải lại trang và đóng thẻ thì để trình duyệt tự hỏi (beforeunload chỉ chặn được hai việc này).
 */
export function dungHoiKhiRoiTrang(daDoi: boolean, hoi: () => Promise<boolean>, dieuHuong: (duongDan: string) => void) {
  const ham = useRef({ hoi, dieuHuong });
  ham.current = { hoi, dieuHuong };
  useEffect(() => {
    if (!daDoi) return;
    let dangRoi = false;
    const chanTaiLai = (e: BeforeUnloadEvent) => e.preventDefault();
    const chanLienKet = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || dangRoi || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || a.target === '_blank' || a.origin !== location.origin) return;
      const den = a.pathname + a.search + a.hash;
      if (den === location.pathname + location.search + location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      void ham.current.hoi().then((dongY) => {
        if (!dongY) return;
        dangRoi = true;
        ham.current.dieuHuong(den);
      });
    };
    // thêm một mục lịch sử trùng địa chỉ để lần bấm Back đầu tiên dừng lại ở biểu mẫu
    history.pushState(history.state, '', location.href);
    const chanBack = () => {
      if (dangRoi) return;
      void ham.current.hoi().then((dongY) => {
        if (dongY) {
          dangRoi = true;
          history.back();
        } else history.pushState(history.state, '', location.href);
      });
    };
    window.addEventListener('beforeunload', chanTaiLai);
    document.addEventListener('click', chanLienKet, true);
    window.addEventListener('popstate', chanBack);
    return () => {
      window.removeEventListener('beforeunload', chanTaiLai);
      document.removeEventListener('click', chanLienKet, true);
      window.removeEventListener('popstate', chanBack);
    };
  }, [daDoi]);
}
