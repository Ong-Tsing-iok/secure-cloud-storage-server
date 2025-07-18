## 建立docker image
`docker build -t="server" .` 

## 建立k8s相關config跟secret
### server-config
```yaml
apiVersion: v1
data:
  default.yaml: | 
  {}
# ^file content
  local.yaml: |
  {}
# ^file content
kind: ConfigMap
metadata:
  name: server-config
  namespace: default
```
### server-tls-secret
```yaml
apiVersion: v1
data:
  tls.crt: # base64 encoding of file
  tls.key: # base64 encoding of file
kind: Secret
metadata:
  name: server-tls-secret
  namespace: default
type: kubernetes.io/tls
```
### wallet-secret
```yaml
apiVersion: v1
data:
  wallet.key: # base64 encoding of file
kind: Secret
metadata:
  name: wallet-secret
  namespace: default
type: Opaque
```
### contract-abi
```yaml
apiVersion: v1
data:
  abi.json: |

# ^file content
kind: ConfigMap
metadata:
  name: contract-abi
  namespace: default
```

## Deploy docker on server
1. copy certificate and bash file  
    要把`certs`資料夾放在`~/`底下  
    > 或是使用
    > `openssl req -x509 -new -nodes -sha256 -utf8 -days 3650 -newkey rsa:2048 -keyout server.key -out server.crt -config ssl.conf` 生成新的憑證。

    複製`server.tar`跟`create_container.sh`到機器上
1. load docker image  
    `docker load -i server.tar`
3. create docker container  
    `sh create_container.sh`  
    這樣container就會開始跑了