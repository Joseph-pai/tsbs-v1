import axios from 'axios';
async function debug() {
    const stockId = '2330';
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stockId}.TW`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log(JSON.stringify(res.data, null, 2));
}
debug();
