"""Server-only enrolled-face features. No identity search or liveness verdict."""
import base64
import hashlib
import io
import json
import os
import re
import threading
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MODEL_ID = 'opencv-sface-2021dec-v1'
MODEL_SHA = '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'
DETECTOR_SHA = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
CONSENT_VERSION = '2026-11-16.face.1'
POLICY_VERSION = 'lumo-face-pilot-2026-11-16.1'
# Conservative pilot setting, not a measured production false-match guarantee.
MATCH_THRESHOLD = 0.6
DIMENSIONS = 128
MAX_PHOTO_BYTES = 262144
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
KEY_ID = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
cv2.setNumThreads(1)
Image.MAX_IMAGE_PIXELS = 1_500_000


class FaceFailure(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def b64encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')


def b64decode(value, maximum=16384):
    if not isinstance(value, str) or not value or len(value) > maximum or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise FaceFailure('INVALID_INPUT')
    try:
        result = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    except Exception:
        raise FaceFailure('INVALID_INPUT') from None
    if b64encode(result) != value:
        raise FaceFailure('INVALID_INPUT')
    return result


def context_for(request):
    if request.get('module') not in ('consumer', 'merchant', 'admin') or request.get('consentVersion') != CONSENT_VERSION:
        raise FaceFailure('INVALID_INPUT')
    if any(not isinstance(request.get(k), str) or not UUID.fullmatch(request[k]) for k in ('requestId', 'subjectId', 'templateId')):
        raise FaceFailure('INVALID_INPUT')
    if type(request.get('templateVersion')) is not int or request['templateVersion'] != 1:
        raise FaceFailure('INVALID_INPUT')
    return {k: request[k] for k in ('module', 'subjectId', 'templateId', 'templateVersion', 'consentVersion')} | {'modelId': MODEL_ID, 'modelSha256': MODEL_SHA, 'purpose': 'lumo-account-face-template'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('utf-8')


class TemplateCipher:
    def __init__(self, keys, active_key_id):
        if not isinstance(keys, dict) or not keys or len(keys) > 8 or not isinstance(active_key_id, str) or active_key_id not in keys:
            raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE')
        self.keys = {}
        for name, value in keys.items():
            if not isinstance(name, str) or not KEY_ID.fullmatch(name):
                raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE')
            try:
                key = b64decode(value, 64)
            except FaceFailure:
                raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE') from None
            if len(key) != 32:
                raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE')
            self.keys[name] = key
        self.active_key_id = active_key_id

    @classmethod
    def from_environment(cls):
        try:
            return cls(json.loads(os.environ.get('LUMO_FACE_TEMPLATE_KEYS', '')), os.environ.get('LUMO_FACE_ACTIVE_KEY_ID', ''))
        except (ValueError, TypeError):
            raise FaceFailure('FACE_CONFIGURATION_UNAVAILABLE') from None

    def encrypt(self, context, vectors, frame_hashes):
        nonce = os.urandom(12)
        payload = {'dimension': DIMENSIONS, 'vectors': b64encode(np.asarray(vectors, dtype='<f4').tobytes()), 'frameHashes': frame_hashes, 'policyVersion': POLICY_VERSION}
        clear = bytearray(canonical(payload))
        try:
            encrypted = AESGCM(self.keys[self.active_key_id]).encrypt(nonce, bytes(clear), canonical(context))
            envelope = {'algorithm': 'A256GCM', 'keyVersion': self.active_key_id, 'nonce': b64encode(nonce), 'ciphertext': b64encode(encrypted)}
            return b64encode(canonical(envelope))
        finally:
            clear[:] = b'\0' * len(clear)

    def decrypt(self, context, opaque):
        try:
            envelope = json.loads(b64decode(opaque, 12288))
            if not isinstance(envelope, dict) or set(envelope) != {'algorithm', 'keyVersion', 'nonce', 'ciphertext'} or envelope['algorithm'] != 'A256GCM':
                raise ValueError()
            key_id = envelope['keyVersion']
            if key_id not in self.keys:
                raise ValueError()
            nonce = b64decode(envelope['nonce'], 24)
            if len(nonce) != 12:
                raise ValueError()
            clear = bytearray(AESGCM(self.keys[key_id]).decrypt(nonce, b64decode(envelope['ciphertext']), canonical(context)))
            try:
                payload = json.loads(clear)
            finally:
                clear[:] = b'\0' * len(clear)
            if not isinstance(payload, dict) or set(payload) != {'dimension', 'vectors', 'frameHashes', 'policyVersion'} or payload['dimension'] != DIMENSIONS or payload['policyVersion'] != POLICY_VERSION:
                raise ValueError()
            vectors = np.frombuffer(b64decode(payload['vectors']), dtype='<f4').copy().reshape((3, DIMENSIONS))
            if not np.isfinite(vectors).all() or not np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=0.001):
                raise ValueError()
            hashes = payload['frameHashes']
            if not isinstance(hashes, list) or len(hashes) != 3 or len(set(hashes)) != 3 or any(not isinstance(x, str) or not re.fullmatch('[0-9a-f]{64}', x) for x in hashes):
                raise ValueError()
            return vectors, hashes, key_id
        except Exception:
            # Do not distinguish wrong-account ciphertext, unknown keys or bad tags.
            raise FaceFailure('FACE_TEMPLATE_UNAVAILABLE') from None


class FaceEngine:
    def __init__(self, model_directory=None):
        self.model_directory = Path(model_directory or os.environ.get('LUMO_FACE_MODEL_DIRECTORY', Path(__file__).parent / 'models'))
        self.lock = threading.Lock()
        self.detector = self.recognizer = None

    def _load(self):
        if self.detector is not None:
            return
        paths = [(self.model_directory / 'face_detection_yunet_2023mar.onnx', DETECTOR_SHA), (self.model_directory / 'face_recognition_sface_2021dec.onnx', MODEL_SHA)]
        for path, expected in paths:
            try:
                if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                    raise FaceFailure('FACE_MODEL_UNAVAILABLE')
            except OSError:
                raise FaceFailure('FACE_MODEL_UNAVAILABLE') from None
        detector = cv2.FaceDetectorYN.create(str(paths[0][0]), '', (320, 320), 0.9, 0.3, 5000)
        recognizer = cv2.FaceRecognizerSF.create(str(paths[1][0]), '')
        # A transient second-model failure must not poison a warm process.
        self.detector, self.recognizer = detector, recognizer

    @staticmethod
    def _image(photo):
        prefix = 'data:image/jpeg;base64,'
        if not isinstance(photo, str) or not photo.startswith(prefix) or len(photo) > 349551:
            raise FaceFailure('INVALID_IMAGE')
        try:
            raw = base64.b64decode(photo[len(prefix):], validate=True)
            if len(raw) < 16 or len(raw) > MAX_PHOTO_BYTES or base64.b64encode(raw).decode() != photo[len(prefix):]:
                raise ValueError()
            with Image.open(io.BytesIO(raw)) as image:
                width, height = image.size
                if image.format != 'JPEG' or width < 128 or height < 128 or width > 1440 or height > 1440 or width * height > 1_500_000:
                    raise ValueError()
                oriented = ImageOps.exif_transpose(image).convert('RGB')
                result = cv2.cvtColor(np.asarray(oriented), cv2.COLOR_RGB2BGR)
            return result, hashlib.sha256(raw).hexdigest()
        except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise FaceFailure('INVALID_IMAGE') from None

    def extract(self, photos):
        if not isinstance(photos, list) or len(photos) != 3:
            raise FaceFailure('INVALID_INPUT')
        if not self.lock.acquire(timeout=10):
            raise FaceFailure('FACE_SERVICE_BUSY')
        frames, features, hashes = [], [], []
        try:
            self._load()
            for photo in photos:
                frame, digest = self._image(photo)
                frames.append(frame)
                if digest in hashes:
                    raise FaceFailure('FACE_CAPTURE_REPLAY')
                hashes.append(digest)
                height, width = frame.shape[:2]
                self.detector.setInputSize((width, height))
                _, faces = self.detector.detect(frame)
                if faces is None or len(faces) == 0:
                    raise FaceFailure('FACE_NOT_FOUND')
                if len(faces) != 1:
                    raise FaceFailure('MULTIPLE_FACES')
                face = faces[0]
                x, y, w, h = face[:4]
                if min(w, h) < 80 or w * h < width * height * 0.06:
                    raise FaceFailure('FACE_TOO_SMALL')
                left, top = max(0, int(x)), max(0, int(y))
                crop = frame[top:min(height, int(y+h)), left:min(width, int(x+w))]
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                if gray.mean() < 30 or gray.mean() > 230:
                    raise FaceFailure('FACE_LIGHTING')
                if cv2.Laplacian(gray, cv2.CV_64F).var() < 25:
                    raise FaceFailure('FACE_BLURRY')
                aligned = self.recognizer.alignCrop(frame, face)
                try:
                    feature = np.asarray(self.recognizer.feature(aligned), dtype=np.float32).reshape(-1).copy()
                finally:
                    aligned.fill(0)
                if feature.size != DIMENSIONS or not np.isfinite(feature).all() or np.linalg.norm(feature) < 0.001:
                    raise FaceFailure('FACE_NOT_FOUND')
                feature /= np.linalg.norm(feature)
                features.append(feature)
            vectors = np.stack(features)
            comparisons = vectors @ vectors.T
            if np.min(comparisons[np.triu_indices(3, 1)]) < MATCH_THRESHOLD:
                vectors.fill(0)
                raise FaceFailure('FACE_INCONSISTENT')
            return vectors, hashes
        except cv2.error:
            raise FaceFailure('FACE_PROCESSING_UNAVAILABLE') from None
        finally:
            for value in frames + features:
                value.fill(0)
            self.lock.release()

    def process(self, request, cipher):
        context = context_for(request)
        operation = request.get('operation')
        allowed = {'operation', 'requestId', 'module', 'subjectId', 'templateId', 'templateVersion', 'consentVersion', 'photos'}
        if operation == 'verify':
            allowed.add('templateCiphertext')
        if set(request) != allowed or operation not in ('enroll', 'verify'):
            raise FaceFailure('INVALID_INPUT')
        enrolled = None
        try:
            if operation == 'verify':
                enrolled, enrolled_hashes, key_version = cipher.decrypt(context, request['templateCiphertext'])
            vectors, hashes = self.extract(request['photos'])
            try:
                result = {'ok': True, 'requestId': request['requestId'], 'modelId': MODEL_ID, 'modelSha256': MODEL_SHA, 'templateId': request['templateId'], 'templateVersion': 1, 'frameHashes': hashes}
                if operation == 'enroll':
                    return result | {'templateCiphertext': cipher.encrypt(context, vectors, hashes), 'keyVersion': cipher.active_key_id}
                if set(hashes).intersection(enrolled_hashes):
                    raise FaceFailure('FACE_CAPTURE_REPLAY')
                matched = bool(np.all(np.max(vectors @ enrolled.T, axis=1) >= MATCH_THRESHOLD))
                return result | {'matched': matched, 'keyVersion': key_version}
            finally:
                vectors.fill(0)
        finally:
            if enrolled is not None:
                enrolled.fill(0)
