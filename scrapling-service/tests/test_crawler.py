import sys
import os
import unittest

# 將 scrapling-service 加入 sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from crawler.rate_limiter import RateLimiter
from crawler.base_crawler import BaseCrawler
from extractors.content_extractor import ContentExtractor
from normalizer.event_normalizer import EventNormalizer
from spiders.twse_spider import TWSESpider
from api.main import app, CrawlRequest, EventQueryRequest, health_check, trigger_crawl, query_events, EVENT_STORE

class TestScraplingService(unittest.TestCase):

    def setUp(self):
        EVENT_STORE.clear()

    def test_1_rate_limiter_and_robots(self):
        limiter = RateLimiter(default_delay=0.1)
        allowed = limiter.is_allowed_by_robots("https://www.twse.com.tw/zh/news/event/2330")
        self.assertTrue(allowed)

    def test_2_content_extractor_and_hash(self):
        html = "<html><body><h1>台積電財報</h1><script>alert(1)</script><p>營收創新高</p></body></html>"
        extracted = ContentExtractor.extract_article(html, fallback_title="預設標題")

        self.assertEqual(extracted["title"], "台積電財報")
        self.assertIn("營收創新高", extracted["text"])
        self.assertNotIn("alert(1)", extracted["text"])
        self.assertEqual(len(extracted["rawContentHash"]), 64) # SHA-256 hex長度

    def test_3_event_normalizer_and_deduplication(self):
        raw_list = [
            {
                "stockId": "2330",
                "title": "台積電 Q3 財報",
                "url": "https://example.com/1",
                "rawContentHash": "hash_a",
                "eventType": "earnings",
            },
            {
                "stockId": "2330",
                "title": "台積電 Q3 財報 重複",
                "url": "https://example.com/1",
                "rawContentHash": "hash_a", # 重複 Hash
                "eventType": "earnings",
            },
            {
                "stockId": "2454",
                "title": "聯發科發布新晶片",
                "url": "https://example.com/2",
                "rawContentHash": "hash_b",
                "eventType": "product",
            }
        ]

        normalized = EventNormalizer.normalize_batch(raw_list)
        self.assertEqual(len(normalized), 2)
        self.assertEqual(normalized[0]["stockId"], "2330")
        self.assertEqual(normalized[1]["stockId"], "2454")

    def test_4_api_health_check(self):
        res = health_check()
        self.assertEqual(res["status"], "ok")
        self.assertTrue(res["compliance"]["robots_txt_enforced"])
        self.assertFalse(res["compliance"]["bypass_auth_allowed"])

    def test_5_api_crawl_and_events_query(self):
        req = CrawlRequest(stockId="2330")
        crawl_res = trigger_crawl(req)

        self.assertTrue(crawl_res["success"])
        self.assertEqual(crawl_res["stockId"], "2330")
        self.assertGreater(len(crawl_res["events"]), 0)

        query_req = EventQueryRequest(stockId="2330")
        events_res = query_events(query_req)
        self.assertTrue(events_res["success"])
        self.assertGreaterEqual(events_res["totalMatches"], 1)

if __name__ == "__main__":
    unittest.main()
