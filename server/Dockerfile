FROM golang:1.21-alpine AS builder
WORKDIR /app
# Copy everything first
COPY . .
# Now tidy and build
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o main main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]
