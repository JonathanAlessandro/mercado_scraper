FROM mcr.microsoft.com/playwright:v1.51.1-noble

WORKDIR /app

# Copia arquivos de dependencias
COPY package*.json ./

# Instala as dependencias
RUN npm ci

# Copia o codigo-fonte e schema SQL
COPY . .

# Comando padrao
CMD ["node", "src/index.js"]
