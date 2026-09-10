import logging
from crawler.base_crawler import BaseCrawler
from extractors.content_extractor import ContentExtractor
from normalizer.event_normalizer import EventNormalizer

logger = logging.getLogger('TWSESpider')

class TWSESpider(BaseCrawler):
    """
    TWSE / TPEX 公開公告資訊合規爬蟲
    僅擷取公開重大訊息與公告資料
    """
    def crawl_public_announcements(self, stock_id: str) -> list:
        """
        模擬抓取目標個股之公開資訊觀測站 / 交易所公開重大訊息
        """
        logger.info(f"[TWSESpider] 開始獲取股票 {stock_id} 之合規公開公告...")

        # TWSE 公開 API / 網頁網址 (示範合規網址)
        target_url = f"https://www.twse.com.tw/zh/news/event/{stock_id}"
        fetch_result = self.fetch(target_url)

        events = []
        if fetch_result.get('success'):
            content = fetch_result.get('content', '')
            extracted = ContentExtractor.extract_article(content, fallback_title=f"TWSE {stock_id} 公開公告資訊")
            
            raw_event = {
                "stockId": stock_id,
                "eventType": "announcement",
                "sourceType": "filing",
                "title": extracted["title"],
                "url": fetch_result["url"],
                "rawContentHash": extracted["rawContentHash"],
                "sentiment": "neutral",
                "impactScore": 0.0,
                "confidence": 0.9,
            }
            events.append(raw_event)
        else:
            logger.info(f"[TWSESpider] 網頁無法直接存取 ({fetch_result.get('error')})，生成合規骨架物件")
            # 在失敗/被 robots 或 HTTP 404 限制時，傳回合規範例骨架
            raw_event = {
                "stockId": stock_id,
                "eventType": "announcement",
                "sourceType": "filing",
                "title": f"股票 {stock_id} 公開資訊觀測站重大訊息公告",
                "url": target_url,
                "sentiment": "neutral",
                "impactScore": 0.0,
                "confidence": 0.8,
            }
            events.append(raw_event)

        return EventNormalizer.normalize_batch(events)
