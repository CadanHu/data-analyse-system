import json
from datetime import date, datetime
from decimal import Decimal

class CustomJSONEncoder(json.JSONEncoder):
    """
    自定义 JSON 编码器，支持日期、时间、Decimal 等类型
    """
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super(CustomJSONEncoder, self).default(obj)

def json_dumps(obj, **kwargs):
    """
    使用自定义编码器的 json.dumps 封装
    """
    # 强制不使用 ensure_ascii 以便输出中文
    kwargs.setdefault('ensure_ascii', False)
    kwargs.setdefault('cls', CustomJSONEncoder)
    return json.dumps(obj, **kwargs)
