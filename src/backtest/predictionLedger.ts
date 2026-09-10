import { PredictionLedgerItem, CreatePredictionLedgerParams } from './types';
import { evaluate5D10PercentTarget } from './targetDefinition';
import { normalizeHistoricalBars } from './historicalData';

/**
 * 驗證單一 PredictionLedgerItem 之型態與必要欄位合法性
 */
export function validatePredictionLedgerItem(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || item.id.trim() === '') return false;
    if (typeof item.signalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.signalDate)) return false;
    if (typeof item.stockId !== 'string' || item.stockId.trim() === '') return false;
    if (typeof item.stockName !== 'string') return false;
    if (typeof item.market !== 'string') return false;
    if (typeof item.signalClose !== 'number' || item.signalClose <= 0 || !Number.isFinite(item.signalClose)) return false;
    if (typeof item.score !== 'number' || !Number.isFinite(item.score)) return false;
    if (typeof item.rank !== 'number' || item.rank < 1) return false;
    if (!Array.isArray(item.reasons)) return false;
    if (typeof item.targetPrice !== 'number' || item.targetPrice <= 0 || !Number.isFinite(item.targetPrice)) return false;
    if (typeof item.maxHigh !== 'number' || !Number.isFinite(item.maxHigh)) return false;
    if (typeof item.maxReturn !== 'number' || !Number.isFinite(item.maxReturn)) return false;
    if (typeof item.hit5d10 !== 'boolean') return false;
    if (item.daysToTarget !== null && (typeof item.daysToTarget !== 'number' || item.daysToTarget < 1 || item.daysToTarget > 5)) return false;
    if (typeof item.dataComplete !== 'boolean') return false;

    // 檢查 day1High ~ day5High 欄位型態
    const dayHighs = [item.day1High, item.day2High, item.day3High, item.day4High, item.day5High];
    for (const dh of dayHighs) {
        if (dh !== null && (typeof dh !== 'number' || !Number.isFinite(dh))) {
            return false;
        }
    }

    return true;
}

/**
 * 依據傳入訊號資料與未來 K 線，自動進行正規化並建立 Prediction Ledger 項目
 */
export function createPredictionLedgerEntry(params: CreatePredictionLedgerParams): PredictionLedgerItem {
    const {
        signalDate,
        stockId,
        stockName,
        market,
        signalClose,
        score,
        rank,
        reasons,
        futureBars
    } = params;

    // 1. 正規化未來 K 線
    const normalizedRes = normalizeHistoricalBars(futureBars || [], { minRequiredBars: 5 });

    // 2. 評估 5D10 觸及目標與統計數據
    const evalRes = evaluate5D10PercentTarget(signalClose, normalizedRes.bars);

    // 3. 取出最多 5 個交易日之最高價 High (不足時填 null)
    const horizonBars = normalizedRes.bars.slice(0, 5);
    const day1High = horizonBars[0] ? horizonBars[0].high : null;
    const day2High = horizonBars[1] ? horizonBars[1].high : null;
    const day3High = horizonBars[2] ? horizonBars[2].high : null;
    const day4High = horizonBars[3] ? horizonBars[3].high : null;
    const day5High = horizonBars[4] ? horizonBars[4].high : null;

    // 4. 格式化理由與標籤陣列
    const formattedReasons = Array.isArray(reasons)
        ? reasons
        : typeof reasons === 'string' && reasons.trim() !== ''
            ? [reasons.trim()]
            : [];

    const item: PredictionLedgerItem = {
        id: `${signalDate}_${String(stockId).trim()}`,
        signalDate: String(signalDate).trim(),
        stockId: String(stockId).trim(),
        stockName: String(stockName).trim(),
        market: String(market).trim(),
        signalClose,
        score,
        rank,
        reasons: formattedReasons,
        targetPrice: evalRes.targetPrice,
        day1High,
        day2High,
        day3High,
        day4High,
        day5High,
        maxHigh: evalRes.maxHigh,
        maxReturn: evalRes.maxReturn,
        hit5d10: evalRes.hit5d10,
        daysToTarget: evalRes.daysToTarget,
        dataComplete: evalRes.dataComplete,
    };

    return item;
}

/**
 * 記憶體 / 回測用 Prediction Ledger Store
 */
export class PredictionLedgerStore {
    private items: Map<string, PredictionLedgerItem> = new Map();

    public add(item: PredictionLedgerItem): boolean {
        if (!validatePredictionLedgerItem(item)) {
            return false;
        }
        this.items.set(item.id, item);
        return true;
    }

    public get(id: string): PredictionLedgerItem | undefined {
        return this.items.get(id);
    }

    public getAll(): PredictionLedgerItem[] {
        return Array.from(this.items.values());
    }

    public clear(): void {
        this.items.clear();
    }
}
