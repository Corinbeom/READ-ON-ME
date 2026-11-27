FROM gradle:8.14.3-jdk17 AS builder
WORKDIR /app
COPY . .
RUN gradle --no-daemon clean bootJar \
    && cp build/libs/*.jar app.jar \
    && java -Djarmode=tools -jar app.jar extract --destination extracted

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /app/extracted/lib/ ./lib/
COPY --from=builder /app/extracted/app.jar ./app.jar
EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
