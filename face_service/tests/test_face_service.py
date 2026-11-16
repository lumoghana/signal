import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from face_service.engine import CONSENT_VERSION, MODEL_ID, MODEL_SHA, FaceEngine, FaceFailure, TemplateCipher, b64encode, context_for, canonical
from face_service.http import handle_request, signature

ROOT=Path(__file__).resolve().parent
CONTEXT={'requestId':'11111111-1111-4111-8111-111111111111','module':'consumer','subjectId':'22222222-2222-4222-8222-222222222222','templateId':'33333333-3333-4333-8333-333333333333','templateVersion':1,'consentVersion':CONSENT_VERSION}
SECRET=bytes(range(32))


def cipher():
    return TemplateCipher({'test-v1':b64encode(bytes(range(32,64)))},'test-v1')


def portrait(name):
    image=cv2.imread(str(ROOT/'fixtures'/name))
    if image is None:
        raise RuntimeError('Missing licensed face fixture')
    detector=cv2.FaceDetectorYN.create(str(ROOT.parent/'models/face_detection_yunet_2023mar.onnx'),'',(image.shape[1],image.shape[0]),0.9)
    _,faces=detector.detect(image)
    if faces is None or len(faces)!=1:
        raise RuntimeError('Fixture no longer has exactly one detectable face')
    x,y,w,h=faces[0][:4]
    left=max(0,int(x-w*.45));top=max(0,int(y-h*.35));right=min(image.shape[1],int(x+w*1.45));bottom=min(image.shape[0],int(y+h*1.35))
    return cv2.resize(image[top:bottom,left:right],(400,440))


def photos(image,seed):
    result=[]
    for i in range(3):
        shift=(seed+i)%7-3
        adjusted=cv2.convertScaleAbs(image,alpha=1+(seed+i)*.001,beta=shift)
        transform=cv2.getRotationMatrix2D((image.shape[1]/2,image.shape[0]/2),(seed+i)*.12,1)
        adjusted=cv2.warpAffine(adjusted,transform,(image.shape[1],image.shape[0]),borderMode=cv2.BORDER_REFLECT)
        ok,jpeg=cv2.imencode('.jpg',adjusted,[cv2.IMWRITE_JPEG_QUALITY,82+(seed+i)%10])
        if not ok:
            raise RuntimeError('Cannot encode fixture')
        result.append('data:image/jpeg;base64,'+base64.b64encode(jpeg).decode())
    return result


class FaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine=FaceEngine()
        cls.a=portrait('face-a.png');cls.b=portrait('face-b.jpg')
        cls.enroll_photos=photos(cls.a,1)
        cls.enrollment=cls.engine.process({'operation':'enroll',**CONTEXT,'photos':cls.enroll_photos},cipher())

    def verify(self,images,**changes):
        return self.engine.process({'operation':'verify',**CONTEXT,'photos':images,'templateCiphertext':self.enrollment['templateCiphertext'],**changes},cipher())

    def test_real_model_enrollment_and_same_face_match(self):
        result=self.verify(photos(self.a,11))
        self.assertTrue(result['matched'])
        self.assertEqual(result['modelId'],MODEL_ID)
        self.assertEqual(result['modelSha256'],MODEL_SHA)
        self.assertNotIn('templateCiphertext',result)
        self.assertNotIn('score',result)

    def test_different_face_cannot_match_enrolled_person(self):
        self.assertFalse(self.verify(photos(self.b,11))['matched'])

    def test_enrolled_photo_bytes_cannot_be_replayed(self):
        with self.assertRaisesRegex(FaceFailure,'FACE_CAPTURE_REPLAY'):
            self.verify(self.enroll_photos)

    def test_mixed_identity_capture_is_rejected(self):
        with self.assertRaisesRegex(FaceFailure,'FACE_INCONSISTENT'):
            self.verify(photos(self.a,12)[:2]+photos(self.b,12)[:1])

    def test_no_face_duplicate_frames_and_multiple_faces_rejected(self):
        with self.assertRaises(FaceFailure):
            self.verify(photos(np.zeros_like(self.a),12))
        image=photos(self.a,13)[0]
        with self.assertRaisesRegex(FaceFailure,'FACE_CAPTURE_REPLAY'):
            self.verify([image,image,image])
        with self.assertRaisesRegex(FaceFailure,'MULTIPLE_FACES'):
            self.verify(photos(np.hstack([self.a,self.b]),14))

    def test_encrypted_template_cannot_move_between_account_module_or_version(self):
        for change in [{'subjectId':'44444444-4444-4444-8444-444444444444'},{'module':'admin'},{'templateId':'55555555-5555-4555-8555-555555555555'}]:
            with self.subTest(change=change),self.assertRaisesRegex(FaceFailure,'FACE_TEMPLATE_UNAVAILABLE'):
                self.verify(photos(self.a,15),**change)

    def test_template_contains_only_authenticated_ciphertext_and_rotates_nonce(self):
        opaque=self.enrollment['templateCiphertext'];envelope=json.loads(base64.urlsafe_b64decode(opaque+'='*(-len(opaque)%4)))
        self.assertEqual(set(envelope),{'algorithm','keyVersion','nonce','ciphertext'})
        vectors,hashes,key=cipher().decrypt(context_for(CONTEXT),opaque)
        self.assertEqual(vectors.shape,(3,128));self.assertTrue(np.allclose(np.linalg.norm(vectors,axis=1),1,atol=.001));self.assertEqual(len(hashes),3)
        again=cipher().encrypt(context_for(CONTEXT),vectors,hashes)
        self.assertNotEqual(opaque,again)
        changed=bytearray(base64.urlsafe_b64decode(envelope['ciphertext']+'='*(-len(envelope['ciphertext'])%4)));changed[0]^=1;envelope['ciphertext']=b64encode(changed)
        with self.assertRaisesRegex(FaceFailure,'FACE_TEMPLATE_UNAVAILABLE'):
            cipher().decrypt(context_for(CONTEXT),b64encode(canonical(envelope)))

    def test_model_integrity_is_required_before_inference(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory,'face_detection_yunet_2023mar.onnx').write_bytes(b'wrong-model')
            with self.assertRaisesRegex(FaceFailure,'FACE_MODEL_UNAVAILABLE'):
                FaceEngine(directory).extract(self.enroll_photos)

    def test_model_load_failure_can_retry_without_partial_initialization(self):
        engine=FaceEngine()
        detector=object();recognizer=object()
        with patch('face_service.engine.cv2.FaceDetectorYN.create',return_value=detector),patch('face_service.engine.cv2.FaceRecognizerSF.create',side_effect=[RuntimeError('temporary'),recognizer]):
            with self.assertRaises(RuntimeError):
                engine._load()
            self.assertIsNone(engine.detector);self.assertIsNone(engine.recognizer)
            engine._load()
        self.assertIs(engine.detector,detector);self.assertIs(engine.recognizer,recognizer)

    def test_key_rotation_preserves_old_template_only_while_old_key_is_retained(self):
        old_key=b64encode(bytes(range(32,64)));new_key=b64encode(bytes(range(64,96)))
        rotated=TemplateCipher({'test-v1':old_key,'test-v2':new_key},'test-v2')
        vectors,hashes,key_id=rotated.decrypt(context_for(CONTEXT),self.enrollment['templateCiphertext'])
        self.assertEqual(key_id,'test-v1')
        updated=rotated.encrypt(context_for(CONTEXT),vectors,hashes)
        current=TemplateCipher({'test-v2':new_key},'test-v2')
        self.assertEqual(current.decrypt(context_for(CONTEXT),updated)[2],'test-v2')
        with self.assertRaisesRegex(FaceFailure,'FACE_TEMPLATE_UNAVAILABLE'):
            current.decrypt(context_for(CONTEXT),self.enrollment['templateCiphertext'])

    def test_explicit_storage_consent_version_required(self):
        with self.assertRaisesRegex(FaceFailure,'INVALID_INPUT'):
            self.verify(photos(self.a,16),consentVersion='wrong')


class ProtocolTests(unittest.TestCase):
    def request(self,body,*,signed=True,when=None,secret=SECRET,engine=None):
        raw=canonical(body);timestamp=str(int(time.time()) if when is None else when)
        headers={'Content-Type':'application/json','X-Lumo-Face-Timestamp':timestamp,'X-Lumo-Face-Signature':signature(secret,'lumo-face-request-v1',timestamp,raw) if signed else '0'*64}
        return raw,handle_request(raw,headers,secret=SECRET,cipher=cipher(),engine=engine)

    def test_caller_scores_and_unsigned_expired_requests_cannot_reach_model(self):
        class Never:
            def process(self,*_):
                raise AssertionError('Unauthenticated request reached inference')
        body={'requestId':CONTEXT['requestId'],'matched':True,'score':1}
        for args in [{'signed':False},{'when':1},{'secret':b'k'*32}]:
            _,result=self.request(body,engine=Never(),**args);self.assertEqual(result[0],403)

    def test_valid_response_binds_exact_signed_request_body_and_id(self):
        class Stub:
            def process(self,request,_):return {'ok':True,'requestId':request['requestId'],'matched':False}
        raw,(status,body,headers)=self.request({'requestId':CONTEXT['requestId']},engine=Stub())
        self.assertEqual(status,200);self.assertEqual(json.loads(body)['matched'],False)
        actual=signature(SECRET,'lumo-face-response-v1',headers['X-Lumo-Face-Timestamp'],body,CONTEXT['requestId'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(headers['X-Lumo-Face-Signature'],actual);self.assertNotIn('Access-Control-Allow-Origin',headers)

    def test_internal_exceptions_do_not_disclose_images_templates_or_keys(self):
        class Broken:
            def process(self,*_):raise ValueError('PRIVATE_PHOTO_TEMPLATE_KEY')
        _,(status,body,_)=self.request({'requestId':CONTEXT['requestId']},engine=Broken())
        self.assertEqual(status,503);self.assertNotIn(b'PRIVATE',body)


if __name__=='__main__':unittest.main()
