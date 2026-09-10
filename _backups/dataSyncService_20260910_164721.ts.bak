import { format } from 'date-fns';
import { StockData } from '@/types';

const SYNC_TIME_KEY = 'tsbs_last_data_sync_time';
const SNAPSHOT_KEY_PREFIX = 'tsbs_local_snapshot_';
const INDUSTRY_MAP_KEY = 'tsbs_industry_map';

export interface SyncStatus {
    hasData: boolean;
    lastSyncTime: string | null;
    totalStocks: number;
}

export const DataSyncService = {
    /**
     * 取得目前本地數據儲存狀態與時間戳記
     */
    getStatus: (): SyncStatus => {
        if (typeof window === 'undefined') {
            return { hasData: false, lastSyncTime: null, totalStocks: 0 };
        }

        const syncTime = localStorage.getItem(SYNC_TIME_KEY) || sessionStorage.getItem(SYNC_TIME_KEY);
        const twse = DataSyncService.getLocalSnapshot('TWSE');
        const tpex = DataSyncService.getLocalSnapshot('TPEX');
        const total = twse.length + tpex.length;

        return {
            hasData: total > 0,
            lastSyncTime: syncTime,
            totalStocks: total
        };
    },

    /**
     * 讀取本地已儲存的市場股票快照數據
     */
    getLocalSnapshot: (market: 'TWSE' | 'TPEX' | 'ALL' = 'TWSE'): StockData[] => {
        if (typeof window === 'undefined') return [];

        try {
            if (market === 'ALL') {
                const twse = DataSyncService.getLocalSnapshot('TWSE');
                const tpex = DataSyncService.getLocalSnapshot('TPEX');
                return [...twse, ...tpex];
            }

            const key = `${SNAPSHOT_KEY_PREFIX}${market}`;
            const cached = localStorage.getItem(key) || sessionStorage.getItem(key);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            console.error('[DataSync] Read local snapshot failed:', e);
            return [];
        }
    },

    /**
     * 一鍵批量下載全市場最新股票數據並儲存至本地內部數據庫
     */
    downloadLatestMarketData: async (
        onProgress?: (progress: { stage: string; percent: number }) => void
    ): Promise<{ success: boolean; timestamp: string; count: number; error?: string }> => {
        try {
            onProgress?.({ stage: '正在準備向證交所抓取上市數據...', percent: 10 });

            // 1. 同時抓取上市 (TWSE) 與上櫃 (TPEX) 快照
            const [twseRes, tpexRes, mapRes] = await Promise.all([
                fetch('/api/market/snapshot?market=TWSE&sector=ALL&refresh=true'),
                fetch('/api/market/snapshot?market=TPEX&sector=AL&refresh=true'),
                fetch('/api/market/industry-mapping?refresh=true')
            ]);

            onProgress?.({ stage: '正在處理並優化資料格式...', percent: 60 });

            const twseJson = await twseRes.json();
            const tpexJson = await tpexRes.json();
            const mapJson = await mapRes.json();

            if (!twseJson.success || !tpexJson.success) {
                throw new Error('證交所數據下載失敗');
            }

            const twseData: StockData[] = twseJson.data || [];
            const tpexData: StockData[] = tpexJson.data || [];
            const industryMap = mapJson.success ? mapJson.data : {};

            onProgress?.({ stage: '寫入內部數據倉庫中...', percent: 85 });

            // 2. 儲存至 Storage
            const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

            try {
                localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}TWSE`, JSON.stringify(twseData));
                localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}TPEX`, JSON.stringify(tpexData));
                localStorage.setItem(INDUSTRY_MAP_KEY, JSON.stringify(industryMap));
                localStorage.setItem(SYNC_TIME_KEY, nowStr);
            } catch (storageError) {
                // 如果 localStorage 配額額滿，回退使用 sessionStorage
                console.warn('[DataSync] localStorage quota exceeded, fallback to sessionStorage');
                sessionStorage.setItem(`${SNAPSHOT_KEY_PREFIX}TWSE`, JSON.stringify(twseData));
                sessionStorage.setItem(`${SNAPSHOT_KEY_PREFIX}TPEX`, JSON.stringify(tpexData));
                sessionStorage.setItem(INDUSTRY_MAP_KEY, JSON.stringify(industryMap));
                sessionStorage.setItem(SYNC_TIME_KEY, nowStr);
            }

            const totalCount = twseData.length + tpexData.length;

            onProgress?.({ stage: `下載完成！已載入 ${totalCount} 檔股票`, percent: 100 });

            return {
                success: true,
                timestamp: nowStr,
                count: totalCount
            };

        } catch (e: any) {
            console.error('[DataSync] Download failed:', e);
            return {
                success: false,
                timestamp: '',
                count: 0,
                error: e.message || '數據下載失敗'
            };
        }
    }
};
