#!/bin/bash
sudo docker run -itd -p 3001:3001 -p 7001:7001 -p 7002:7002 --net host -v ~/certs:/usr/src/app/certs --group-add 1002 --name server server:latest