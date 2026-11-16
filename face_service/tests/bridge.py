"""Test-only bridge: actual Python inference/HMAC from the actual Edge provider."""
import json
import sys
from face_service.engine import TemplateCipher, b64decode
from face_service.http import handle_request

item=json.load(sys.stdin)
status,body,headers=handle_request(item['body'].encode(),item['headers'],secret=b64decode(item['secret'],64),cipher=TemplateCipher(item['keys'],item['activeKey']))
json.dump({'status':status,'body':body.decode(),'headers':headers},sys.stdout,separators=(',',':'))
