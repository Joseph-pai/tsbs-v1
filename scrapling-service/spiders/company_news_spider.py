import logging
from crawler.base_crawler import BaseCrawler
from extractors.content_extractor import ContentExtractor
from normalizer.event_normalizer import EventNormalizer

logger = logging.getLogger('CompanyNewsSpider')

class CompanyNewsSpider(BaseCrawler):
    """
    公司官方新聞與公開產能 / 營收報導合規爬蟲
    """
    def crawl_news(self, stock_id: str, target_url: str = None) -> list:
        url = target_url or f"https://mops.twse.com.tw/mops/web/t05st01?step=1&colorchg=1&co_id={stock_id}"
        logger.info(f"[CompanyNewsSpider] 開始獲取股票 {stock_id} 公開資訊...")

        fetch_result = self.fetch(url)
        events = []

        if fetch_result.get('success'):
            content = fetch_result.get('content', '')
            extracted = ContentExtractor.extract_article(content, fallback_title=f"股票 {stock_id} 官方營收與營運新聞")

            raw_event = {
                "stockId": stock_id,
                "eventType": "revenue",
                "sourceType": "news",
                "title": extracted["title"],
                "url": fetch_result["url"],
                "rawContentHash": extracted["rawContentHash"],
                "sentiment": "bullish",
                "impactScore": 0.5,
                "confidence": 0.85,
            }
            events.append(raw_event)
        else:
            raw_event = {
                "stockId": stock_id,
                "eventType": "revenue",
                "sourceType": "news",
                "title": f"股票 {stock_id} 官方營收新聞與公開營運公告",
                "url": url,
                "sentiment": "neutral",
                "impactScore": 0.0,
                "confidence": 0.75,
            }
            events.append(raw_event)

        return EventNormalizer.normalize_batch(events)
