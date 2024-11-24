FROM node:22
RUN apt-get update && apt-get install -y tcpdump && apt-get clean
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json", "./"]
RUN npm install --production && mv node_modules ../ \
&& rm -r /usr/local/lib/node_modules/npm/node_modules/cross-spawn/
# RUN rm -r /usr/lib/node_modules_20/npm/node_modules/cross-spawn/
# RUN rm -r /usr/local/n/versions/node/18.20.5/lib/node_modules/npm/node_modules/cross-spawn/
COPY src ./src
COPY config ./config
COPY index.js .
EXPOSE 3001
EXPOSE 7002
EXPOSE 7001
RUN chown -R node /usr/src/app
USER node
CMD ["npm", "start"]
