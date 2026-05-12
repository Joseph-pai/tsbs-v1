# Smart Navigator Performance Optimization (Parallel Data Fetching)

Optimize the data fetching layer to resolve `502 Bad Gateway` timeouts. By switching from sequential to parallel HTTP requests, we will reduce the execution time of the `/api/smart-navigator` route from ~10s+ to ~3s.

## User Review Required

> [!IMPORTANT]
> - This change only affects **how** data is downloaded. The **analysis logic and formulas remain 100% unchanged**.
> - It uses `Promise.all` to fetch multiple months of stock data and market data simultaneously.

## Proposed Changes

### Data Layer: Exchange Client

#### [MODIFY] [exchange.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/exchange.ts)
- Refactor `getStockHistory`: Replace the `for` loop with `Promise.all` to fetch 6 months of OHLC data in parallel.
- Refactor `getTaiexHistory`: Replace the `for` loop with `Promise.all` to fetch TAIEX data in parallel.

### API Layer: Smart Navigator Route

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- Parallelize independent calls: Use `Promise.all` to fetch `getStockHistory`, `getIndustryMapping`, `getTotalShares`, and `getTaiexHistory` simultaneously instead of one after another.

## Verification Plan

### Static Analysis
- Ensure error handling remains robust so that if one month fails, the others are still processed (graceful degradation).
- Verify that deduplication and sorting logic in `getStockHistory` still works correctly after parallel execution.

### Manual Verification
- Deploy to Netlify and verify that the 502 errors are resolved.
- Verify that the screening results (lights, tags, prices) remain identical to the previous version.
