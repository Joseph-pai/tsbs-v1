import time
import logging
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s'
)
logger = logging.getLogger('ScraplingRateLimiter')

class RateLimiter:
    """
    請求頻率限制器與 robots.txt 合規驗證器
    """
    def __init__(self, default_delay: float = 1.0, user_agent: str = "ScraplingBot/1.0 (+http://tsbs-v1.local)"):
        self.default_delay = default_delay
        self.user_agent = user_agent
        self._last_request_time = {}
        self._robots_cache = {}

    def is_allowed_by_robots(self, url: str) -> bool:
        """
        檢查目標 URL 是否被 robots.txt 允許存取
        """
        try:
            parsed = urlparse(url)
            domain = f"{parsed.scheme}://{parsed.netloc}"
            robots_url = f"{domain}/robots.txt"

            if domain not in self._robots_cache:
                rfp = RobotFileParser()
                rfp.set_url(robots_url)
                try:
                    rfp.read()
                    self._robots_cache[domain] = rfp
                except Exception as e:
                    logger.warning(f"無法讀取 {robots_url}: {e}，預設允許合規請求")
                    return True

            rfp = self._robots_cache.get(domain)
            if rfp:
                allowed = rfp.can_fetch(self.user_agent, url)
                if not allowed:
                    logger.warning(f"URL 被 robots.txt 阻擋: {url}")
                return allowed
            return True
        except Exception as err:
            logger.error(f"檢查 robots.txt 時發生異常: {err}")
            return True

    def wait_if_needed(self, domain: str, delay: float = None):
        """
        強制請求間隔延遲，遵守速率限制
        """
        target_delay = delay if delay is not None else self.default_delay
        now = time.time()
        last_time = self._last_request_time.get(domain, 0)
        elapsed = now - last_time

        if elapsed < target_delay:
            sleep_duration = target_delay - elapsed
            logger.debug(f"速率控制：對 {domain} 沉睡 {sleep_duration:.2f} 秒")
            time.sleep(sleep_duration)

        self._last_request_time[domain] = time.time()
