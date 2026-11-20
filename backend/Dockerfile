# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-25@sha256:93b8a14ea2f412782e4e842651273b4d903e35cc496284f178fbbe2d67d00976 AS build
WORKDIR /build
COPY pom.xml .
COPY src/main ./src/main
# The verification job runs the PostgreSQL tests before the container smoke test.
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn --batch-mode --no-transfer-progress compile jar:jar spring-boot:repackage

FROM eclipse-temurin:25-jre-alpine@sha256:69c2a26e9894016e274c880fa542956d005b3755f84db765145185e87405bd89
RUN addgroup -S -g 10001 conduit && adduser -S -D -H -u 10001 -G conduit conduit
WORKDIR /app
COPY --from=build /build/target/*.jar /app/conduit.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/conduit.jar"]
