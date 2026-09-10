import time
import logging
from urllib.parse import urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .rate_limiter import RateLimiter

logger = logging.getLogger('BaseCrawler')

# 嘗試載入 scrapling 套件，若環境未安裝則優雅回退
try:
    import scrapling
    SCRAPLING_AVAILABLE = True
    logger.info("Scrapling 框架已順利載入")
except ImportError:
    SCRAPLING_AVAILABLE = False
    logger.warning("系統尚未安裝 scrapling，使用內建標準 HTTP 合規適配器")

class BaseCrawler:
    """
    符合合規性標準之基礎爬蟲
    具備：Timeout, Retry, Rate Limiting, Robots.txt Check, Error Handling, Logging
    """
    def __init__(self, timeout: float = 10.0, max_retries: int = 3, rate_limit_delay: float = 1.0):
        self.timeout = timeout
        self.max_retries = max_retries
        self.rate_limiter = RateLimiter(default_delay=rate_limit_delay)
        
        # 設定 HTTP Session 重試策略
        self.session = requests.Session()
        retries = Retry(
            total=max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            raise_on_status=False
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.headers.update({
            "User-Agent": "ScraplingBot/1.0 (+http://tsbs-v1.local; Public Information Crawler)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        })

    def fetch(self, url: str) -> dict:
        """
        獲取公開網頁內容，自動套用合規檢測與 Rate Limiting
        """
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            return {"success": False, "error": "無效的 URL 協定", "url": url}

        # 1. 檢查 robots.txt 授權
        if not self.rate_limiter.is_allowed_by_robots(url):
            return {
                "success": False,
                "error": "Access blocked by target website robots.txt policy",
                "url": url,
                "blocked_by_robots": True,
            }

        # 2. Rate Limiting
        domain = urlparse(url).netloc
        self.rate_limiter.wait_if_needed(domain)

        # 3. 執行 Request (具備 Timeout, Retry & Error Handling)
        start_time = time.time()
        try:
            logger.info(f"[Fetch]: 開始抓取公開 URL: {url}")
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
            elapsed = time.time() - start_time

            return {
                "success": True,
                "url": response.url,
                "status_code": response.status_code,
                "content": response.text,
                "elapsed_seconds": round(elapsed, 4),
            }
        except requests.exceptions.RequestException as err:
            logger.error(f"[Fetch Failure] URL {url}: {err}")
            return {
                "success": False,
                "url": url,
                "error": str(err),
                "status_code": getattr(err.response, 'status_code', None) if hasattr(err, 'response') else None,
            }
