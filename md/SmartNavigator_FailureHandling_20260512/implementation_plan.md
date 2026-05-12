# Smart Navigator Data Failure Handling & Re-screening

Enhance the "Smart Navigator" (智能選股導航) auto-screening process to track and display stocks that failed to fetch market data, and allow users to re-screen those specific stocks.

## User Review Required

> [!IMPORTANT]
> - The screening logic will now track failed stocks and display them in a summary alert.
> - A "Re-screen" button will be added to specifically target failed stocks.
> - This change only affects the "Auto Filter" (自動篩選) mode.

## Proposed Changes

### Frontend: Smart Navigator Page

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)

- **State Management**:
    - Add `failedStocks` state to store `{ id: string, name: string }` objects.
- **Functionality**:
    - Modify `handleAutoFilter` to:
        - Accept an optional `stocksToRetry` parameter.
        - If `stocksToRetry` is provided, use it as the source list; otherwise, fetch from `scanRecords` as before.
        - Track failures during the API calls and update the `failedStocks` state.
        - Append new successful results to `filterResults` if retrying, or reset it if starting fresh.
- **UI**:
    - Add an alert section below the "Auto Filter Result" header when `failedStocks.length > 0`.
    - This alert will show the count of failed stocks and provide a button to trigger `handleAutoFilter` for those stocks.

## Verification Plan

### Automated Tests
- I will simulate API failures in a temporary test script or by temporarily modifying the API route to ensure the frontend correctly catches and displays the failures.
- I will verify that clicking "Re-screen" correctly calls the API only for the failed stocks.

### Manual Verification
- After implementation, I will perform a scan and observe if any stocks fail (if the API is stable, I might temporarily block a specific stock ID in the code to trigger a failure).
- Verify the alert box appears with the correct count.
- Click "針對這些股票再次篩選" and ensure it attempts to fetch data for them again.
