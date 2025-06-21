
#!/bin/bash

# Script de configuración de base de datos PostgreSQL para MAAT v1.3.0
echo "🗄️ Configurando base de datos PostgreSQL para MAAT v1.3.0..."

# Verificar si PostgreSQL está instalado
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL no está instalado. Instalando..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt-get update
        sudo apt-get install -y postgresql postgresql-contrib
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install postgresql
        brew services start postgresql
    else
        echo "❌ Sistema operativo no soportado"
        exit 1
    fi
fi

# Crear base de datos y usuario
echo "📊 Creando base de datos y usuario..."

sudo -u postgres psql << EOF
CREATE DATABASE maat_db;
CREATE USER maat_user WITH PASSWORD 'maat_password_secure_2024';
GRANT ALL PRIVILEGES ON DATABASE maat_db TO maat_user;
ALTER USER maat_user CREATEDB;
\q
EOF

# Verificar conexión
echo "🔍 Verificando conexión..."
PGPASSWORD=maat_password_secure_2024 psql -h localhost -U maat_user -d maat_db -c "SELECT version();"

if [ $? -eq 0 ]; then
    echo "✅ Base de datos configurada exitosamente"
    echo "📝 DATABASE_URL=postgresql://maat_user:maat_password_secure_2024@localhost:5432/maat_db"
else
    echo "❌ Error configurando la base de datos"
    exit 1
fi

# Generar migraciones
echo "🔄 Generando migraciones..."
npm run db:generate

# Ejecutar migraciones
echo "📤 Ejecutando migraciones..."
npm run db:migrate

echo "🎉 Base de datos MAAT v1.3.0 configurada completamente"
