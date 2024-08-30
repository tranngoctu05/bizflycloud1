# Sử dụng hình ảnh Node.js chính thức với các gói bổ sung cần thiết cho Puppeteer
FROM node:20-alpine

# Cài đặt các phụ thuộc cho Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Thiết lập thư mục làm việc
WORKDIR /app

# Sao chép file package.json và package-lock.json vào Docker image
COPY package*.json ./

# Cài đặt các phụ thuộc từ npm
RUN npm install

# Sao chép toàn bộ mã nguồn vào Docker image
COPY . .

# Thiết lập biến môi trường cho Puppeteer để sử dụng Chromium đã cài đặt
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Expose port
EXPOSE 8989

# Chạy ứng dụng
CMD [ "npm", "run", "start" ]
