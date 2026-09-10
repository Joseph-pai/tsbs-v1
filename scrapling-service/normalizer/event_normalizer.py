import datetime
import hashlib

class EventNormalizer:
    """
    事件資料標準化與 Event Alpha JSON 規格轉譯器
    包含 publishedAt, extractedAt, rawContentHash, deduplication 邏輯
    """

    VALID_EVENT_TYPES = [
        'earnings', 'revenue', 'contract', 'product', 'capacity', 'factory',
        'investment', 'management', 'institutional', 'industry', 'regulation', 'other'
    ]

    VALID_SOURCE_TYPES = ['news', 'filing', 'announcement', 'report', 'social', 'other']

    @classmethod
    def to_event_json(cls, raw_data: dict) -> dict:
        """
        將單筆 Raw 爬蟲結果轉換為標準 Event Alpha JSON 物件
        """
        stock_id = str(raw_data.get('stockId', '0000')).strip()
        title = str(raw_data.get('title', '')).strip()
        url = str(raw_data.get('url', '')).strip()
        content_hash = str(raw_data.get('rawContentHash', '')).strip()

        if not content_hash and (title or url):
            content_hash = hashlib.sha256(f"{title}_{url}".encode('utf-8')).hexdigest()

        # 生成 eventId
        event_id = raw_data.get('eventId')
        if not event_id:
            timestamp_ms = int(datetime.datetime.now().timestamp() * 1000)
            short_hash = content_hash[:8] if content_hash else "nohash"
            event_id = f"evt_{stock_id}_{timestamp_ms}_{short_hash}"

        # 事件類別與來源類別校驗
        event_type = raw_data.get('eventType', 'other')
        if event_type not in cls.VALID_EVENT_TYPES:
            event_type = 'other'

        source_type = raw_data.get('sourceType', 'news')
        if source_type not in cls.VALID_SOURCE_TYPES:
            source_type = 'news'

        # 時間轉置 ISO 8601
        published_at = raw_data.get('publishedAt')
        if isinstance(published_at, datetime.datetime):
            published_at_str = published_at.isoformat() + "Z"
        elif isinstance(published_at, str) and published_at:
            published_at_str = published_at
        else:
            published_at_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        extracted_at_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "eventId": event_id,
            "stockId": stock_id,
            "eventType": event_type,
            "sourceType": source_type,
            "title": title,
            "publishedAt": published_at_str,
            "url": url,
            "sentiment": raw_data.get('sentiment', 'neutral'),
            "impactScore": float(raw_data.get('impactScore', 0.0)),
            "confidence": float(raw_data.get('confidence', 0.5)),
            "rawContentHash": content_hash,
            "extractedAt": extracted_at_str,
            "metadata": raw_data.get('metadata', {}),
        }

    @classmethod
    def normalize_batch(cls, raw_list: list) -> list:
        """
        批次標準化與排重 (Deduplication via eventId & rawContentHash)
        """
        if not isinstance(raw_list, list):
            return []

        seen_ids = set()
        seen_hashes = set()
        result = []

        for item in raw_list:
            if not item or not isinstance(item, dict):
                continue

            event = cls.to_event_json(item)

            if event['eventId'] in seen_ids:
                continue

            if event['rawContentHash'] and event['rawContentHash'] in seen_hashes:
                continue

            seen_ids.add(event['eventId'])
            if event['rawContentHash']:
                seen_hashes.add(event['rawContentHash'])

            result.append(event)

        return result
