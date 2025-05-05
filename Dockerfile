FROM ubuntu:noble AS build

RUN export DEBIAN_FRONTEND="noninteractive" \
    && apt update && apt install --no-install-recommends -y \
      build-essential \
      ca-certificates \
      bash \
      git \
      curl \
      python3 \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    

RUN sed -i 's/[ -z "$PS1" ] && return//g' /root/.bashrc

SHELL [ "/bin/bash", "-l", "-c" ]

ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=v22

RUN mkdir -p $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# install node and npm
RUN source $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

# add node and npm to path so the commands are available
ENV NODE_PATH=$NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN npm install --global corepack && corepack enable && corepack install --global yarn@1.22.22

RUN curl -fsSL -o get-platformio.py https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py
RUN python3 get-platformio.py

COPY . /usr/src

WORKDIR /usr/src

RUN ./bootstrap.sh