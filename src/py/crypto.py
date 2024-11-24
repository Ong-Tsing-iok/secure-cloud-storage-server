from charm.schemes.prenc.pre_nal16 import NAL16b
from charm.core.engine.util import objectToBytes,bytesToObject
from charm.toolbox.pairinggroup import PairingGroup
from charm.toolbox.integergroup import IntegerGroup
import sys
import json
import argparse

group_obj = PairingGroup('SS512')
pre = NAL16b(group_obj)

def retrieve_params(serialized_params_json):
    serialized_params = json.loads(serialized_params_json)
    params = {}
    for key, element in serialized_params.items():
        params[key] = bytesToObject(element.encode('utf-8'), group_obj)
    return params

def retrieve_cipher(serialized_cipher_json):
    serialized_cipher = json.loads(serialized_cipher_json)
    cipher = {}
    for key, element in serialized_cipher.items():
        if key == 'c3':
            cipher[key] = bytesToObject(element.encode('utf-8'), IntegerGroup())
        else:
            cipher[key] = bytesToObject(element.encode('utf-8'), group_obj)
    return cipher

def serialize_group_element(object, group_obj):
    return objectToBytes(object, group_obj).decode('utf-8')

def deserialize_group_element(object, group_obj):
    return bytesToObject(object.encode('utf-8'), group_obj)

def serialize_cipher(cipher: dict):
    serialized_c = {}
    for key, element in cipher.items():
        if key == 'c3':
            serialized_c[key] = serialize_group_element(element, IntegerGroup())
        else:
            serialized_c[key] = serialize_group_element(element, group_obj)
    return json.dumps(serialized_c)

def parser_setup():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--setup', action='store_true', help='perform setup to get parameters')
    group.add_argument('--keygen', action='store_true', help='perform keygen [--params]')
    group.add_argument('--encrypt', action='store_true', help='perform encryption [--params --pk --message]')
    group.add_argument('--decrypt', action='store_true', help='perform decryption [--pk --sk --ciphertext (--owner)]')
    group.add_argument('--rekeygen', action='store_true', help='perform rekeygen from sk owner to pk owner [--params --pk --sk]')
    group.add_argument('--re-encrypt', action='store_true', help='perform re-encryption [--params --rekey --ciphertext]')
    parser.add_argument('-P', '--params', help='input parameters')
    parser.add_argument('-s', '--sk', help='input secret key')
    parser.add_argument('-p', '--pk', help='input public key')
    group2 = parser.add_mutually_exclusive_group()
    group2.add_argument('-m', '--message', help='input message')
    group2.add_argument('-c', '--ciphertext', help='input ciphertext')
    parser.add_argument('-r', '--rekey', help='input re-encryption key')
    parser.add_argument('--owned', action='store_true', help='flag to indicate that you are the owner of the message when decrypting')  
    return parser

parser = parser_setup()
args = parser.parse_args()

if len(sys.argv) > 1:
    if args.setup:
        '''
        output: params
        '''
        params = pre.setup()
        serialized_params = {}
        for key, element in params.items():
            serialized_params[key] = serialize_group_element(element, group_obj)
        print(json.dumps(serialized_params), end='')
    elif args.keygen:
        '''
        output: pk\nsk
        '''
        if args.params == None:
            parser.error('--params is required')
            
        params = retrieve_params(args.params)
        (pk, sk) = pre.keygen(params)
        print(serialize_group_element(pk, group_obj))
        print(serialize_group_element(sk, group_obj), end='')
    elif args.encrypt:
        '''
        output: cipher
        '''
        if args.params == None or args.pk == None or args.message == None:
            parser.error('--params --pk --message are required')
            
        params = retrieve_params(args.params)
        pk = deserialize_group_element(args.pk, group_obj)
        msg = args.message.encode('utf-8')
        cipher = pre.encrypt(params, pk, msg)
        print(serialize_cipher(cipher), end='')
    elif args.decrypt:
        '''
        output: msg
        '''
        if args.params == None or args.pk == None or args.sk == None or args.ciphertext == None:
            parser.error('--params --pk --sk --ciphertext are required')
            
        params = retrieve_params(args.params)
        pk = deserialize_group_element(args.pk, group_obj)
        sk = deserialize_group_element(args.sk, group_obj)
        cipher = retrieve_cipher(args.ciphertext)
        if args.owned:
            rk = pre.rekeygen(None, None, sk, pk, None)
            cipher = pre.re_encrypt(params, rk, cipher)
        m = pre.decrypt(params, sk, cipher)
        print(m.decode('utf-8'), end='')
    elif args.rekeygen:
        '''
        output: rk
        '''
        if args.pk == None or args.sk == None:
            parser.error('--pk --sk are required')
            
        pk_b = deserialize_group_element(args.pk, group_obj)
        sk_a = deserialize_group_element(args.sk, group_obj)
        rk = pre.rekeygen(None, None, sk_a, pk_b, None)
        print(serialize_group_element(rk, group_obj), end='')
    elif args.re_encrypt:
        '''
        output: cipher
        '''
        if args.params == None or args.rekey == None or args.ciphertext == None:
            parser.error('--params --rekey --ciphertext are required')
            
        params = retrieve_params(args.params)
        rk = deserialize_group_element(args.rekey, group_obj)
        cipher = retrieve_cipher(args.ciphertext)
        cipher = pre.re_encrypt(params, rk, cipher)
        print(serialize_cipher(cipher), end='')