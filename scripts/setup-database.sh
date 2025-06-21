
#!/bin/bash

# Script de configuración de base de datos PostgreSQL para MAAT v1.3.1
# 🗄️ Configuración empresarial completa

echo "🗄️ Configurando Base de Datos MAAT v1.3.1..."

# Verificar si PostgreSQL está instalado
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL no está instalado"
    echo "💡 Instalando PostgreSQL..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql postgresql-server
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install postgresql
        fi
    fi
fi

# Iniciar servicio PostgreSQL
echo "🚀 Iniciando PostgreSQL..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
elif [[ "$OSTYPE" == "darwin"* ]]; then
    brew services start postgresql
fi

# Configurar base de datos
echo "⚙️ Configurando base de datos MAAT..."

# Crear usuario y base de datos
sudo -u postgres psql << EOF
CREATE USER maat_user WITH PASSWORD 'maat_password_secure_2024';
CREATE DATABASE maat_database OWNER maat_user;
GRANT ALL PRIVILEGES ON DATABASE maat_database TO maat_user;
\q
EOF

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env..."
    cat > .env << EOF
# Base de datos PostgreSQL
DATABASE_URL="postgresql://maat_user:maat_password_secure_2024@localhost:5432/maat_database"
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maat_database
DB_USER=maat_user
DB_PASSWORD=maat_password_secure_2024

# JWT Configuration
JWT_SECRET="maat_jwt_secret_key_2024_secure"
JWT_EXPIRES_IN="7d"

# Security Configuration
ENCRYPTION_KEY="maat_encryption_key_2024_very_secure"
VIRUS_SCANNER_ENABLED=true
AUDIT_LOGGING_ENABLED=true

# Performance Configuration
MAX_FILE_SIZE=104857600
MAX_CONCURRENT_UPLOADS=10
COMPRESSION_ENABLED=true

# Service Configuration
SERVICE_NAME="MAAT v1.3.1"
SERVICE_VERSION="1.3.1"
API_PORT=5000
EOF
fi

# Instalar dependencias de Node.js
echo "📦 Instalando dependencias..."
npm install

# Ejecutar migraciones
echo "🔄 Ejecutando migraciones..."
npm run db:migrate

echo "🎉 Base de datos MAAT v1.3.1 configurada exitosamente!"
echo "📊 Detalles de conexión:"
echo "  - Host: localhost"
echo "  - Puerto: 5432"
echo "  - Base de datos: maat_database"
echo "  - Usuario: maat_user"
echo ""
echo "✅ Sistema listo para usar"
