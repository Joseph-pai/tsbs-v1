import re
import hashlib
from html import unescape

class ContentExtractor:
    """
    HTML 內文解析與標題/正文提取模組
    包含 HTML 標籤去除、文字清理與 SHA-256 rawContentHash 計算
    """

    @staticmethod
    def compute_raw_content_hash(text: str) -> str:
        """
        計算原文之 SHA-256 雜湊碼 (用於校驗與排重)
        """
        if not text:
            return ""
        cleaned = text.strip()
        return hashlib.sha256(cleaned.encode('utf-8')).hexdigest()

    @staticmethod
    def clean_html(html_content: str) -> str:
        """
        去除 HTML 標籤並還原實體字元
        """
        if not html_content:
            return ""
        # 去除 <script> 與 <style> 標籤內文
        cleaned = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        # 去除 HTML 標籤
        cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
        # 還原 HTML 實體字元 (&nbsp;, &amp; 等)
        cleaned = unescape(cleaned)
        # 合併多重空白
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned

    @classmethod
    def extract_article(cls, html_content: str, fallback_title: str = "") -> dict:
        """
        從 HTML 提取標題、內文與產出 rawContentHash
        """
        if not html_content:
            return {
                "title": fallback_title,
                "text": "",
                "rawContentHash": "",
            }

        # 嘗試提取 <title> 或 <h1> / <h2> 內容
        title_match = re.search(r'<(title|h1|h2)[^>]*>(.*?)</\1>', html_content, flags=re.IGNORECASE | re.DOTALL)
        extracted_title = unescape(title_match.group(2)).strip() if title_match else fallback_title
        extracted_title = re.sub(r'\s+', ' ', extracted_title)

        cleaned_text = cls.clean_html(html_content)
        content_hash = cls.compute_raw_content_hash(cleaned_text if cleaned_text else extracted_title)

        return {
            "title": extracted_title or fallback_title,
            "text": cleaned_text,
            "rawContentHash": content_hash,
        }
