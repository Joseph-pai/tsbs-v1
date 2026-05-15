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
    scale: 1.5,
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

  // 建立 A4 PDF
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();

  // 把 canvas 像素高度換算成 PDF 的 mm 高度（等比換算）
  const imgHeightMM = (canvas.height * pdfWidth) / canvas.width;

  // 用 jsPDF 官方的「負 Y 座標翻頁」方法：
  // 把同一張大圖多次貼入 PDF，每頁用不同偏移量（position）使各頁顯示的是圖的不同段落
  let heightLeft = imgHeightMM;
  let position = 0; // 從 0 開始（第一頁，圖的頂端對齊頁面頂端）

  pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeightMM);
  heightLeft -= pdfPageHeight;

  while (heightLeft > 0) {
    position -= pdfPageHeight; // 每翻一頁，把圖往上推一個頁面高度
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeightMM);
    heightLeft -= pdfPageHeight;
  }

  pdf.save(filename);

  // 恢復原本的捲動位置
  window.scrollTo(savedScrollX, savedScrollY);
};
