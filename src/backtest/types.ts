import { NormalizedBar } from './historicalData';

export interface PredictionLedgerItem {
    id: string;                 // unique key e.g. `${signalDate}_${stockId}`
    signalDate: string;         // YYYY-MM-DD
    stockId: string;
    stockName: string;
    market: 'TWSE' | 'TPEX' | string;
    signalClose: number;

    score: number;
    rank: number;
    reasons: string[];

    targetPrice: number;        // signalClose * 1.10

    day1High: number | null;
    day2High: number | null;
    day3High: number | null;
    day4High: number | null;
    day5High: number | null;

    maxHigh: number;
    maxReturn: number;

    hit5d10: boolean;
    daysToTarget: number | null;

    dataComplete: boolean;
}

export interface CreatePredictionLedgerParams {
    signalDate: string;
    stockId: string;
    stockName: string;
    market: 'TWSE' | 'TPEX' | string;
    signalClose: number;
    score: number;
    rank: number;
    reasons: string[] | string;
    futureBars: NormalizedBar[] | any[];
}
