FROM ubuntu:noble AS base

RUN export DEBIAN_FRONTEND="noninteractive" \
    && apt update && apt install --no-install-recommends -y \
      build-essential \
      ca-certificates \
      bash \
      git \
      curl \
      python3 \
      python3-venv \
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

ENV PIO_PATH=/root/.platformio/penv/bin
ENV PATH=$PIO_PATH:$PATH 

RUN git clone --recursive https://github.com/igrr/mkspiffs.git \
    && cd mkspiffs \     
    && make clean \
    && make dist BUILD_CONFIG_NAME="-arduino-esp32" \
    CPPFLAGS="-DSPIFFS_OBJ_META_LEN=4" \
    && cp mkspiffs /root/.platformio/penv/bin/mkspiffs_espressif32_arduino

WORKDIR /usr/src
COPY ./firmware/platformio.ini ./firmware/sdkconfig.esp32-c3-devkitm-1 /usr/src/firmware/

RUN cd firmware && platformio pkg install --environment esp32-c3-devkitm-1 

FROM base AS build

COPY ./ /usr/src

RUN ./bootstrap.sh