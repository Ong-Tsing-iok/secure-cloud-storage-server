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