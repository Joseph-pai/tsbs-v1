import sys
import os
from typing import List, Optional
from pydantic import BaseModel, Field

# 將專案根目錄加入 PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI, HTTPException
from spiders.twse_spider import TWSESpider
from spiders.company_news_spider import CompanyNewsSpider
from normalizer.event_normalizer import EventNormalizer

app = FastAPI(
    title="Scrapling Data Acquisition Service",
    description="獨立公開資料爬蟲與 Event Alpha JSON 標準化服務 (合規、零 AI、零 DB 直接寫入)",
    version="1.0.0"
)

# 記憶體內快取 Event 數據 (獨立 Data Layer)
EVENT_STORE: List[dict] = []

class CrawlRequest(BaseModel):
    stockId: str = Field(..., description="目標個股代號 (例: 2330)")
    sourceUrl: Optional[str] = Field(None, description="指定抓取之公開網址 (選填)")

class EventQueryRequest(BaseModel):
    stockId: Optional[str] = Field(None, description="依個股代號篩選")
    eventType: Optional[str] = Field(None, description="依事件類別篩選")
    limit: int = Field(50, ge=1, le=500, description="回傳最大筆數")

@app.get("/health")
def health_check():
    """
    GET /health: 健康檢查與服務狀態
    """
    return {
        "status": "ok",
        "service": "Scrapling Data Acquisition Service",
        "version": "1.0.0",
        "compliance": {
            "robots_txt_enforced": True,
            "rate_limit_enabled": True,
            "bypass_auth_allowed": False,
            "bypass_captcha_allowed": False,
        },
        "total_events_in_store": len(EVENT_STORE),
    }

@app.post("/crawl")
def trigger_crawl(req: CrawlRequest):
    """
    POST /crawl: 觸發合規公開資料爬蟲
    """
    if not req.stockId:
        raise HTTPException(status_code=400, detail="stockId 為必填欄位")

    stock_id = req.stockId.strip()
    twse_spider = TWSESpider()
    news_spider = CompanyNewsSpider()

    new_events = []
    # 1. 執行 TWSE 合規爬蟲
    twse_results = twse_spider.crawl_public_announcements(stock_id)
    new_events.extend(twse_results)

    # 2. 執行官方新聞爬蟲
    news_results = news_spider.crawl_news(stock_id, target_url=req.sourceUrl)
    new_events.extend(news_results)

    # 3. 排重並合併至 EVENT_STORE
    combined = EventNormalizer.normalize_batch(EVENT_STORE + new_events)
    EVENT_STORE.clear()
    EVENT_STORE.extend(combined)

    return {
        "success": True,
        "stockId": stock_id,
        "crawledCount": len(new_events),
        "totalEventsCount": len(EVENT_STORE),
        "events": new_events,
    }

@app.post("/events")
def query_events(req: EventQueryRequest):
    """
    POST /events: 查詢標準化 Event Alpha JSON 列表
    """
    filtered = EVENT_STORE

    if req.stockId:
        filtered = [e for e in filtered if e.get('stockId') == req.stockId.strip()]

    if req.eventType:
        filtered = [e for e in filtered if e.get('eventType') == req.eventType.strip()]

    limited_results = filtered[:req.limit]

    return {
        "success": True,
        "totalMatches": len(filtered),
        "returnedCount": len(limited_results),
        "events": limited_results,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
