# Sử dụng node image từ Alpine cho môi trường production
FROM node:20-alpine AS dev

# Thiết lập thư mục làm việc
WORKDIR /app

# Cài đặt các phụ thuộc hệ thống cần thiết cho Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-dejavu \
    # Thêm bất kỳ phụ thuộc nào khác cần thiết
    && npm install -g puppeteer

# Sao chép package.json và package-lock.json
COPY package*.json ./

# Cài đặt các phụ thuộc Node.js
RUN npm install

# Sao chép mã nguồn ứng dụng vào container
COPY . .

# Cấu hình Puppeteer để sử dụng Chromium cài sẵn
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Mở cổng ứng dụng
EXPOSE 8989

# Chạy ứng dụng
CMD [ "npm", "run", "start" ]
