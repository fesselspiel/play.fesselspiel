FROM eclipse-mosquitto:2.0

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY entrypoint.sh /playplaner-entrypoint.sh
USER root
RUN apk add --no-cache openssl && chmod +x /playplaner-entrypoint.sh
ENTRYPOINT ["/playplaner-entrypoint.sh"]
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
