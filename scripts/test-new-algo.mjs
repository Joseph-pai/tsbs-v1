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
        // Correct date calculation for previous months
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
        console.log('Fetching:', dateStr);
        const data = await fetchMonthly(dateStr);
        if (data.data) months.push(...data.data);
    }

    // Sort by date ROC (e.g. 113/11/01)
    const allData = months.sort((a, b) => a[0].localeCompare(b[0]));
    const volumes = allData.map(d => parseFloat(d[1].replace(/,/g, '')));

    console.log('Total data points:', volumes.length);

    if (volumes.length < 48) {
        console.log('Insufficient data for 3+45 rule');
        // Fallback to show what we have
    }

    // New Algo: 3 vs 45
    const observationPeriod = 3;
    const baselinePeriod = 45;
    
    const recent = volumes.slice(-observationPeriod);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

    const remaining = volumes.slice(0, -observationPeriod);
    const base = remaining.slice(-baselinePeriod);
    const baseAvg = base.reduce((a, b) => a + b, 0) / base.length;

    const vRatio = recentAvg / baseAvg;

    console.log('\n--- New Algo (3 vs 45) ---');
    console.log('Recent 3 Avg:', recentAvg.toFixed(2));
    console.log('Base 45 Avg:', baseAvg.toFixed(2));
    console.log('V-Ratio:', vRatio.toFixed(2));
    
    // Old Algo (Single vs 20)
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
