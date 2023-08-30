include .env
export $(shell sed 's/=.*//' .env)

.PHONY: build clean publish test

# Default make task
all: build

build:
	make -j 2 anchor_build docker_build
	make measurement

anchor_build:
	anchor build

docker_build:
ifndef CONTAINER_NAME
	$(error CONTAINER_NAME is not set)
endif
	DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 --pull -f ./switchboard-function/Dockerfile -t ${CONTAINER_NAME} ./switchboard-function/

publish:
	make -j 2 anchor_publish docker_publish
	make measurement
	anchor run update-measurement

anchor_publish:
	anchor deploy

docker_publish:
ifndef CONTAINER_NAME
	$(error CONTAINER_NAME is not set)
endif
	DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 --pull -f ./switchboard-function/Dockerfile -t ${CONTAINER_NAME}:latest --push ./switchboard-function/

measurement:
ifndef CONTAINER_NAME
	$(error CONTAINER_NAME is not set)
endif
	@docker run -d --platform=linux/amd64 --name=my-switchboard-function ${CONTAINER_NAME}:latest > /dev/null
	@docker cp my-switchboard-function:/measurement.txt measurement.txt
	@docker stop my-switchboard-function > /dev/null
	@docker rm my-switchboard-function > /dev/null
	@echo -n 'MrEnclve: '
	@cat measurement.txt

# Task to clean up the compiled rust application
clean:
	cargo clean
