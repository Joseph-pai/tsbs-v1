import { RawEventInput } from './eventTypes';

/**
 * Scrapling Python 服務 HTTP Client
 * 專責呼叫 Python FastAPI (scrapling-service)
 * 具備 Timeout 與 降級 (Graceful Degradation) 防護
 */

const DEFAULT_SERVICE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 3000;

function getServiceUrl(): string {
    const url = process.env.SCRAPLING_SERVICE_URL || DEFAULT_SERVICE_URL;
    return url.replace(/\/+$/, '');
}

/**
 * 檢查 Scrapling 服務健康狀態
 */
export async function checkScraplingHealth(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<boolean> {
    const baseUrl = getServiceUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) return false;
        const data = await response.json();
        return data?.status === 'ok';
    } catch (e) {
        clearTimeout(timer);
        return false;
    }
}

/**
 * 觸發 Scrapling 合規公開爬蟲取得指定個股最新事件
 * 對應 Python Service: POST /crawl
 */
export async function crawlStockEvents(
    stockId: string,
    options?: { sourceUrl?: string; timeoutMs?: number }
): Promise<RawEventInput[]> {
    if (!stockId || !stockId.trim()) {
        return [];
    }

    const baseUrl = getServiceUrl();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/crawl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stockId: stockId.trim(),
                ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
            }),
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
            console.warn(`[ScraplingClient] POST /crawl returned HTTP status ${response.status} for stockId ${stockId}`);
            return [];
        }

        const data = await response.json();
        if (data && data.success && Array.isArray(data.events)) {
            return data.events as RawEventInput[];
        }

        return [];
    } catch (error: any) {
        clearTimeout(timer);
        if (error.name === 'AbortError') {
            console.warn(`[ScraplingClient] POST /crawl timed out (${timeoutMs}ms) for stockId ${stockId}`);
        } else {
            console.warn(`[ScraplingClient] POST /crawl failed for stockId ${stockId}: ${error.message}`);
        }
        return [];
    }
}

/**
 * 查詢 Python 服務內快取之標準化事件清單
 * 對應 Python Service: POST /events
 */
export async function queryStockEvents(
    params: { stockId?: string; eventType?: string; limit?: number },
    options?: { timeoutMs?: number }
): Promise<RawEventInput[]> {
    const baseUrl = getServiceUrl();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...(params.stockId ? { stockId: params.stockId.trim() } : {}),
                ...(params.eventType ? { eventType: params.eventType.trim() } : {}),
                limit: params.limit ?? 50,
            }),
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
            console.warn(`[ScraplingClient] POST /events returned HTTP status ${response.status}`);
            return [];
        }

        const data = await response.json();
        if (data && data.success && Array.isArray(data.events)) {
            return data.events as RawEventInput[];
        }

        return [];
    } catch (error: any) {
        clearTimeout(timer);
        if (error.name === 'AbortError') {
            console.warn(`[ScraplingClient] POST /events timed out (${timeoutMs}ms)`);
        } else {
            console.warn(`[ScraplingClient] POST /events failed: ${error.message}`);
        }
        return [];
    }
}
