# Fix: PDF Export "Capture Failed" Error

The current PDF export fails for long reports because it attempts to capture the entire content in a single high-resolution canvas, exceeding browser memory or dimension limits. I will implement segmented capturing (chunking) to ensure stability and reliability.

## User Review Required

> [!IMPORTANT]
> I will implement a "segmented capture" strategy. The report will be captured in vertical slices and then seamlessly reassembled into a single-page long PDF. This matches the "Smart Navigator" approach and prevents the "Capture Failed" error on mobile/tablet devices.

## Proposed Changes

### [Core Utility]

#### [MODIFY] [pdfUtils.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/pdfUtils.ts)
- Update `exportToPDF` to:
    - Measure the total height of the element.
    - Capture the element in vertical segments (chunks) of ~3000px each.
    - Combine these segments into a single long-page PDF.
    - Maintain `scale: 2.0` for high quality.
    - Ensure `backgroundColor` and `useCORS` are applied to each segment.

## Verification Plan

### Manual Verification
- Run a long "定點共振掃描" and export to PDF.
- Run a large "準確率回測" report and export.
- Verify that the "截圖失敗" error no longer occurs and the PDF is a single continuous page.
