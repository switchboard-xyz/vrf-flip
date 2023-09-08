.PHONY: build clean publish test

# Variables
DOCKER_IMAGE_NAME=gallynaut/solana-vrf-flip
DOCKER_BUILD_COMMAND=DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64

# Default make task
all: build

docker_build: 
	${DOCKER_BUILD_COMMAND} --pull -f Dockerfile -t ${DOCKER_IMAGE_NAME}:latest --load ./
docker_publish: 
	${DOCKER_BUILD_COMMAND} --pull -f Dockerfile -t ${DOCKER_IMAGE_NAME} --push ./

build: docker_build measurement

dev: dev_docker_build measurement

publish: docker_publish measurement

measurement:
	@docker run -d --platform=linux/amd64 --name=my-switchboard-function ${DOCKER_IMAGE_NAME}:latest > /dev/null
	@docker cp my-switchboard-function:/measurement.txt measurement.txt
	@docker stop my-switchboard-function > /dev/null
	@docker rm my-switchboard-function > /dev/null

# Task to clean up the compiled rust application
clean:
	cargo clean
