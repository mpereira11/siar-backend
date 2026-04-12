FROM node:20-alpine

WORKDIR /app

# Copiar dependencias primero (cache de Docker)
COPY package*.json ./
RUN npm ci --only=production

# Copiar schema de Prisma y generar cliente
COPY prisma ./prisma
RUN npx prisma generate

# Copiar el resto del código
COPY src ./src

# Puerto que Railway detecta automáticamente
EXPOSE 3000

# En producción: aplicar migraciones pendientes y arrancar
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
