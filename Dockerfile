FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl
RUN chmod +x ./kubectl
RUN mv ./kubectl /usr/local/bin

ENV KUBECONFIG /usr/src/app/allianz-kubeconfig

EXPOSE 3032
CMD [ "node", "app.js" ]