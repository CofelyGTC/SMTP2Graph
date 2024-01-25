FROM node:16.19.0-slim as base



EXPOSE 587

FROM base as builder
WORKDIR /etc/opt
#RUN npm i
COPY . /etc/build
WORKDIR /etc/build
#RUN apt install node-gyp
#RUN node-gyp --python=python3 configure

RUN npm i
RUN npm run build

FROM builder
RUN mv ./dist /etc/opt/smtp2graph

COPY ./start.sh /etc/opt/start.sh
#COPY ./app.js /etc/opt/app.js
RUN rm -d -r /etc/build
RUN chmod ugo+rwx -R /etc/opt/*
RUN groupadd -r myuser && useradd -r -g myuser myuser
#"HERE DO WHAT YOU HAVE TO DO AS A ROOT USER LIKE INSTALLING PACKAGES ETC."
USER myuser
CMD /etc/opt/start.sh