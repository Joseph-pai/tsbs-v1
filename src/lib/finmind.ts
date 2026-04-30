import axios from 'axios';
import { CONFIG } from './config';
import { StockData, InstitutionalData, FinMindResponse } from '@/types';

/**
 * FinMind API Client
 * Uses Authorization: Bearer header for token (matching official Python library)
 */
const client = axios.create({
    baseURL: CONFIG.FINMIND.API_URL,
    timeout: 15000, // 15 seconds
    headers: {
        'Authorization': `Bearer ${CONFIG.FINMIND.TOKEN}`,
    },
});

/**
 * Enhanced FinMind Client
 * Uses plain objects for params to ensure Axios compatibility.
 */
export const FinMindClient = {
    getDailyStats: async (options: { stockId?: string; date?: string; startDate?: string; endDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockPrice',
            };
            if (options.stockId) params.data_id = options.stockId;
            // Map 'date' to 'start_date' AND 'end_date' for single-day snapshot
            if (options.date) {
                params.start_date = options.date;
                params.end_date = options.date;
            }
            if (options.startDate) params.start_date = options.startDate;
            if (options.endDate) params.end_date = options.endDate;

            const res = await client.get<FinMindResponse<StockData>>('', { params });

            if (!res.data || res.data.status !== 200) {
                const msg = res.data?.msg || 'No response';
                if (msg.includes('Your level is register')) {
                    const tierError = new Error('FINMIND_TIER_RESTRICTION');
                    (tierError as any).tier = 'register';
                    throw tierError;
                }
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${msg}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            if (error.message === 'FINMIND_TIER_RESTRICTION') throw error;
            if (error.response) {
                const msg = error.response.data?.msg || JSON.stringify(error.response.data);
                if (msg.includes('Your level is register')) {
                    const tierError = new Error('FINMIND_TIER_RESTRICTION');
                    (tierError as any).tier = 'register';
                    throw tierError;
                }
                throw new Error(`API ${error.response.status}: ${msg}`);
            }
            throw error;
        }
    },

    getInstitutional: async (options: { stockId?: string; date?: string; startDate?: string; endDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockHoldingSharesPer',
            };
            if (options.stockId) params.data_id = options.stockId;
            // Map 'date' to 'start_date' AND 'end_date' for single-day snapshot
            if (options.date) {
                params.start_date = options.date;
                params.end_date = options.date;
            }
            if (options.startDate) params.start_date = options.startDate;
            if (options.endDate) params.end_date = options.endDate;

            const res = await client.get<FinMindResponse<InstitutionalData>>('', { params });

            if (!res.data || res.data.status !== 200) {
                const msg = res.data?.msg || 'No response';
                if (msg.includes('Your level is register')) {
                    const tierError = new Error('FINMIND_TIER_RESTRICTION');
                    (tierError as any).tier = 'register';
                    throw tierError;
                }
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${msg}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            if (error.message === 'FINMIND_TIER_RESTRICTION') throw error;
            if (error.response) {
                const msg = error.response.data?.msg || JSON.stringify(error.response.data);
                if (msg.includes('Your level is register')) {
                    const tierError = new Error('FINMIND_TIER_RESTRICTION');
                    (tierError as any).tier = 'register';
                    throw tierError;
                }
                throw new Error(`API ${error.response.status}: ${msg}`);
            }
            throw error;
        }
    },

    getStockInfo: async () => {
        try {
            const params = {
                dataset: 'TaiwanStockInfo',
            };
            const res = await client.get<FinMindResponse<{ stock_id: string; stock_name: string }>>('', { params });
            return res.data.data || [];
        } catch (error: any) {
            console.error(`FinMind Network Error [Info]: ${error.message}`);
            return [];
        }
    }
};

// Additional helper for monthly revenue
export const FinMindExtras = {
    getMonthlyRevenue: async (options: { stockId?: string; startDate?: string; endDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockMonthRevenue',
            };
            if (options.stockId) params.data_id = options.stockId;
            if (options.startDate) params.start_date = options.startDate;
            if (options.endDate) params.end_date = options.endDate;

            const res = await client.get<FinMindResponse<any>>('', { params });
            if (!res.data || res.data.status !== 200) {
                const msg = res.data?.msg || 'No response';
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${msg}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            console.warn('[FinMindExtras] MonthlyRevenue fetch failed:', error.message || error);
            return [];
        }
    },

    getMarginTrading: async (options: { stockId?: string; startDate?: string; endDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockMarginPurchaseShortSale',
            };
            if (options.stockId) params.data_id = options.stockId;
            if (options.startDate) params.start_date = options.startDate;
            if (options.endDate) params.end_date = options.endDate;

            const res = await client.get<FinMindResponse<any>>('', { params });
            if (!res.data || res.data.status !== 200) {
                const msg = res.data?.msg || 'No response';
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${msg}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            console.warn('[FinMindExtras] MarginTrading fetch failed:', error.message || error);
            return [];
        }
    }
};
