import fs from 'fs';

const symbols = ["2323", "2349", "2543", "3013", "4979", "5457", "6116", "6223", "8046", "8996"];
const START_DATE = '2026-04-01';
const END_DATE = '2026-06-23';

async function fetchStockData(symbol) {
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${START_DATE}&end_date=${END_DATE}`;
    console.log(`Fetching ${symbol}...`);
    const res = await fetch(url);
    const data = await res.json();
    return data.data || [];
}

async function run() {
    const allData = {};
    for (const sym of symbols) {
        try {
            const data = await fetchStockData(sym);
            if (data.length > 0) {
                allData[sym] = data;
            } else {
                console.log(`No data for ${sym}`);
            }
            // slight delay to avoid rate limit
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`Error fetching ${sym}:`, e);
        }
    }
    fs.writeFileSync('/tmp/winning_stocks_data.json', JSON.stringify(allData));
    console.log("Done fetching and saved to /tmp/winning_stocks_data.json");
}

run();
