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

  // 強制捲動至文件最頂部，確保截圖完整
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 300)); // 增加延遲確保渲染穩定

  const elementWidth = element.offsetWidth;
  const elementHeight = element.offsetHeight;
  const chunkHeight = 3000; // 每段截取的高度，避免 Canvas 超出瀏覽器限制
  const totalChunks = Math.ceil(elementHeight / chunkHeight);
  
  const capturedChunks: { data: string; heightMM: number }[] = [];
  const pdfWidth = 210; // 固定 PDF 寬度 210mm (A4 標準寬度)

  try {
    for (let i = 0; i < totalChunks; i++) {
      const yOffset = i * chunkHeight;
      const h = Math.min(chunkHeight, elementHeight - yOffset);

      // 建立一個臨時容器來截取特定區段
      const container = document.createElement('div');
      container.style.width = `${elementWidth}px`;
      container.style.height = `${h}px`;
      container.style.overflow = 'hidden';
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.backgroundColor = '#020617';

      // 複製目標元素並位移，只露出當前要截取的區段
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.marginTop = `-${yOffset}px`;
      clone.style.width = `${elementWidth}px`;
      clone.style.transform = 'none';
      clone.style.transition = 'none';
      clone.style.animation = 'none';
      
      container.appendChild(clone);
      document.body.appendChild(container);

      // 給予微小延遲確保 DOM 掛載與渲染完成
      await new Promise(r => setTimeout(r, 150));

      const canvas = await html2canvas(container, {
        scale: 2, // 保持高品質
        useCORS: true,
        backgroundColor: '#020617',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      
      if (!imgData || imgData === 'data:,' || imgData.length < 100) {
        throw new Error(`區段 ${i + 1} 截取失敗，請稍後再試。`);
      }

      const imgHeightMM = (canvas.height * pdfWidth) / canvas.width;
      capturedChunks.push({ data: imgData, heightMM: imgHeightMM });

      // 清理臨時容器
      document.body.removeChild(container);
      
      // 每一段截完稍作休息，避免瀏覽器卡死
      if (totalChunks > 1) await new Promise(r => setTimeout(r, 200));
    }

    if (capturedChunks.length > 0) {
      // 根據第一個區塊的高度建立第一頁
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, capturedChunks[0].heightMM]
      });

      pdf.addImage(capturedChunks[0].data, 'JPEG', 0, 0, pdfWidth, capturedChunks[0].heightMM);

      // 為後續每個區塊動態新增一頁
      for (let i = 1; i < capturedChunks.length; i++) {
        const chunk = capturedChunks[i];
        pdf.addPage([pdfWidth, chunk.heightMM], 'portrait');
        pdf.addImage(chunk.data, 'JPEG', 0, 0, pdfWidth, chunk.heightMM);
      }

      pdf.save(filename);
    }
  } catch (error: any) {
    console.error('[pdfUtils] Export failed:', error);
    throw error;
  } finally {
    // 恢復原本的捲動位置
    window.scrollTo(savedScrollX, savedScrollY);
  }
};
