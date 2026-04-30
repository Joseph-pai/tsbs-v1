async function test() {
    const stockId = '2330';
    const now = new Date();
    const months = [];
    
    console.log('--- 正在抓取數據以驗證新算法 (3 vs 45)... ---');
    
    for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockId}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.data) months.push(...data.data);
        } catch (e) {
            console.error('抓取失敗:', dateStr, e.message);
        }
    }

    const allData = months.sort((a, b) => a[0].localeCompare(b[0]));
    const volumes = allData.map(d => parseFloat(d[1].replace(/,/g, '')));

    console.log('總交易日筆數:', volumes.length);

    if (volumes.length < 10) {
        console.log('數據不足，無法執行驗證');
        return;
    }

    // 新算法: 3 vs 45
    const obsIdx = 3;
    const baseIdx = 45;
    
    const recent = volumes.slice(-obsIdx);
    const observationAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

    const remaining = volumes.slice(0, -obsIdx);
    const baselineVolumes = remaining.slice(-baseIdx);
    const baselineAvg = baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length;

    const vRatio = observationAvg / baselineAvg;

    console.log('\n[新演算法 - 3日平均 vs 45日基線]');
    console.log('觀察期平均 (最近3日):', observationAvg.toFixed(2));
    console.log('基線期平均 (過去45日):', baselineAvg.toFixed(2));
    console.log('量能共振倍數 (V-Ratio):', vRatio.toFixed(2));
    
    // 舊算法對比: 1 vs 20
    const today = volumes[volumes.length - 1];
    const prev20 = volumes.slice(-21, -1);
    const prev20Avg = prev20.reduce((a, b) => a + b, 0) / prev20.length;
    const oldVratio = today / prev20Avg;

    console.log('\n[舊演算法對比 - 1日 vs 20日平均]');
    console.log('今日成交量:', today.toFixed(2));
    console.log('過去20日平均:', prev20Avg.toFixed(2));
    console.log('舊版 V-Ratio:', oldVratio.toFixed(2));
    
    console.log('\n結論:', vRatio > oldVratio ? '新算法對當前累積量能更敏感' : '舊算法對單日突發爆量較敏感');
}

test();
