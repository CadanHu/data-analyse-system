import json
import base64
from datetime import date, datetime
from decimal import Decimal
import numpy as np

class CustomJSONEncoder(json.JSONEncoder):
    """
    自定义 JSON 编码器，支持日期、时间、Decimal、numpy、bytes 等类型
    """
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, bytes):
            return base64.b64encode(obj).decode('utf-8')
        if isinstance(obj, (np.int_, np.intc, np.intp, np.int8,
                            np.int16, np.int32, np.int64, np.uint8,
                            np.uint16, np.uint32, np.uint64)):
            return int(obj)
        if isinstance(obj, (np.float16, np.float32, np.float64)):
            return float(obj)
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        # 🚀 增加对 Pandas Period 的支持
        if hasattr(obj, 'to_timestamp'):
            return obj.to_timestamp().isoformat()
        if hasattr(obj, 'to_dict'):
            return obj.to_dict()
        return super(CustomJSONEncoder, self).default(obj)

def json_dumps(obj, **kwargs):
    """
    使用自定义编码器的 json.dumps 封装
    """
    # 强制不使用 ensure_ascii 以便输出中文
    kwargs.setdefault('ensure_ascii', False)
    kwargs.setdefault('cls', CustomJSONEncoder)
    return json.dumps(obj, **kwargs)
