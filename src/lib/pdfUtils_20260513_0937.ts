import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 匯出指定 DOM 元素為 PDF 檔案
 *
 * 策略：
 * 1. 先把頁面捲動歸零，避免 html2canvas 座標偏移
 * 2. 一次性截取整個目標元素（不做分塊，避免座標計算錯誤）
 * 3. 把完整大圖用 jsPDF 的負 Y 座標翻頁法，切頁貼入 PDF
 *
 * @param elementId 要截取的目標容器 ID
 * @param filename  匯出後的檔名
 */
export const exportToPDF = async (elementId: string, filename: string): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`[pdfUtils] 找不到指定的元素: ${elementId}`);
  }

  // 記錄目前捲動位置，截圖完後恢復
  const savedScrollY = window.scrollY;
  const savedScrollX = window.scrollX;

  // 強制捲動至文件最頂部，確保 html2canvas 座標與 DOM 對齊
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 150));

  // 一次性截取整個元素，完整高度，不傳 y / height 分塊參數
  const canvas = await html2canvas(element, {
    scale: 2, // 提升解析度以確保文字清晰
    useCORS: true,
    backgroundColor: '#020617',
    scrollX: 0,
    scrollY: 0,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  if (!imgData || imgData === 'data:,' || imgData.length < 100) {
    window.scrollTo(savedScrollX, savedScrollY);
    throw new Error('截圖失敗，畫面元素可能尚未渲染完成，請稍後再試。');
  }

  // 1. 計算 PDF 寬度與對應的高度 (以 210mm 為基準寬度)
  const pdfWidth = 210;
  const imgHeightMM = (canvas.height * pdfWidth) / canvas.width;

  // 2. 建立自定義高度的 PDF (單頁長卷，消除分頁斷裂)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidth, imgHeightMM]
  });

  // 3. 直接貼入單張完整大圖
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeightMM);

  pdf.save(filename);

  // 恢復原本的捲動位置
  window.scrollTo(savedScrollX, savedScrollY);
};
