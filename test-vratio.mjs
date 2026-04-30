async function test() {
    const stockId = '2330';
    const now = new Date();
    
    // Helper to get monthly data
    const fetchMonthly = async (date) => {
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockId}`;
        const res = await fetch(url);
        return res.json();
    };

    const months = [];
    for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
        console.log('Fetching:', dateStr);
        const data = await fetchMonthly(dateStr);
        if (data.data) months.push(...data.data);
    }

    const allData = months.sort((a, b) => a[0].localeCompare(b[0]));
    const volumes = allData.map(d => parseFloat(d[1].replace(/,/g, '')));

    console.log('Total data points:', volumes.length);

    if (volumes.length < 10) {
        console.log('Insufficient data');
        return;
    }

    // Implementation matching engine.ts
    const observationPeriod = 3;
    const baselinePeriod = 45;
    
    const recent = volumes.slice(-observationPeriod);
    const observationAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

    const remaining = volumes.slice(0, -observationPeriod);
    const baselineVolumes = remaining.slice(-baselinePeriod);
    const baselineAvg = baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length;

    const vRatio = observationAvg / baselineAvg;

    console.log('\n--- New Algo (3 vs 45) ---');
    console.log('Observation Avg (Recent 3):', observationAvg.toFixed(2));
    console.log('Baseline Avg (Prev 45):', baselineAvg.toFixed(2));
    console.log('V-Ratio:', vRatio.toFixed(2));
    
    // Comparison
    const today = volumes[volumes.length - 1];
    const prev20 = volumes.slice(-21, -1);
    const prev20Avg = prev20.reduce((a, b) => a + b, 0) / prev20.length;
    const oldVratio = today / prev20Avg;

    console.log('\n--- Old Algo (1 vs 20) ---');
    console.log('Today:', today.toFixed(2));
    console.log('Prev 20 Avg:', prev20Avg.toFixed(2));
    console.log('V-Ratio:', oldVratio.toFixed(2));
}

test();
