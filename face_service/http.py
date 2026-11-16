"""HMAC-authenticated internal endpoint. Never log request/response bodies."""
import hashlib
import hmac
import json
import os
import re
import time

from .engine import FaceEngine, FaceFailure, TemplateCipher, UUID, b64decode, canonical

MAX_REQUEST_BYTES = 1_100_000
_engine = FaceEngine()


def signature(secret, domain, timestamp, body, request_id='', request_hash=''):
    context = domain + '\n' + str(timestamp) + '\n'
    if request_id:
        context += request_id + '\n' + request_hash + '\n'
    return hmac.new(secret, context.encode('ascii') + body, hashlib.sha256).hexdigest()


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def handle_request(raw_body, headers, *, engine=None, cipher=None, secret=None, now=time.time):
    public_headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}
    headers = {str(k).lower(): str(v) for k, v in headers.items()}
    try:
        if secret is None:
            secret = b64decode(os.environ.get('LUMO_FACE_PROCESSOR_SECRET', ''), 64)
        if not isinstance(secret, bytes) or len(secret) != 32:
            raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE')
    except FaceFailure:
        return 503, canonical({'ok': False, 'code': 'FACE_CONFIGURATION_UNAVAILABLE'}), public_headers
    timestamp = headers.get('x-lumo-face-timestamp', '')
    supplied = headers.get('x-lumo-face-signature', '')
    if not isinstance(raw_body, bytes) or len(raw_body) > MAX_REQUEST_BYTES or not re.fullmatch(r'[0-9]{10}', timestamp) or abs(int(now()) - int(timestamp)) > 60 or not re.fullmatch(r'[0-9a-f]{64}', supplied):
        return 403, canonical({'ok': False, 'code': 'SERVER_REQUIRED'}), public_headers
    expected = signature(secret, 'lumo-face-request-v1', timestamp, raw_body)
    if not hmac.compare_digest(expected, supplied):
        return 403, canonical({'ok': False, 'code': 'SERVER_REQUIRED'}), public_headers
    request_id = '00000000-0000-0000-0000-000000000000'
    status = 200
    try:
        if headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
            raise FaceFailure('INVALID_INPUT')
        request = json.loads(raw_body, object_pairs_hook=no_duplicate_keys)
        if not isinstance(request, dict):
            raise FaceFailure('INVALID_INPUT')
        if isinstance(request.get('requestId'), str) and UUID.fullmatch(request['requestId']):
            request_id = request['requestId']
        result = (engine or _engine).process(request, cipher or TemplateCipher.from_environment())
        if abs(int(now()) - int(timestamp)) > 60:
            raise FaceFailure('FACE_REQUEST_EXPIRED')
    except FaceFailure as error:
        result = {'ok': False, 'requestId': request_id, 'code': error.code}
    except Exception:
        # Exception messages may contain image metadata or request values.
        # The public/internal protocol carries one bounded code only.
        status, result = 503, {'ok': False, 'requestId': request_id, 'code': 'FACE_PROCESSING_UNAVAILABLE'}
    response = canonical(result)
    response_timestamp = str(int(now()))
    digest = hashlib.sha256(raw_body).hexdigest()
    public_headers |= {'X-Lumo-Face-Timestamp': response_timestamp, 'X-Lumo-Face-Signature': signature(secret, 'lumo-face-response-v1', response_timestamp, response, request_id, digest)}
    return status, response, public_headers
