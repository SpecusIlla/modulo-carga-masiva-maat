
#!/bin/bash

# Script de instalación de ClamAV para MAAT v1.1.0
# 🛡️ Escáner de virus avanzado

echo "🛡️ Instalando ClamAV para MAAT v1.1.0..."

# Detectar el sistema operativo
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        echo "📦 Detectado sistema Debian/Ubuntu"
        sudo apt-get update
        sudo apt-get install -y clamav clamav-daemon clamav-freshclam
    elif command -v yum &> /dev/null; then
        # RedHat/CentOS
        echo "📦 Detectado sistema RedHat/CentOS"
        sudo yum install -y clamav clamav-update
    elif command -v dnf &> /dev/null; then
        # Fedora
        echo "📦 Detectado sistema Fedora"
        sudo dnf install -y clamav clamav-update
    else
        echo "❌ Sistema Linux no soportado automáticamente"
        exit 1
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "📦 Detectado macOS"
    if command -v brew &> /dev/null; then
        brew install clamav
    else
        echo "❌ Homebrew no encontrado. Instala Homebrew primero."
        exit 1
    fi
else
    echo "❌ Sistema operativo no soportado: $OSTYPE"
    exit 1
fi

# Configurar ClamAV
echo "⚙️ Configurando ClamAV..."

# Crear directorio de configuración si no existe
sudo mkdir -p /etc/clamav

# Configuración básica para freshclam
if [ ! -f /etc/clamav/freshclam.conf ]; then
    sudo tee /etc/clamav/freshclam.conf > /dev/null <<EOF
# Configuración de FreshClam para MAAT
DatabaseMirror database.clamav.net
LogFile /var/log/clamav/freshclam.log
LogTime yes
LogVerbose yes
DatabaseDirectory /var/lib/clamav
PidFile /var/run/clamav/freshclam.pid
ConnectTimeout 30
ReceiveTimeout 30
TestDatabases yes
ScriptedUpdates yes
CompressLocalDatabase no
SafeBrowsing yes
Bytecode yes
NotifyClamd /etc/clamav/clamd.conf
MaxAttempts 5
DatabaseCustomURL http://www.securiteinfo.com/get/premium-securiteinfo-clamav/2023/securiteinfo.hdb
DatabaseCustomURL http://www.malwarepatrol.net/cgi/submit?action=get_list&product=clamav
EOF
fi

# Configuración básica para clamd
if [ ! -f /etc/clamav/clamd.conf ]; then
    sudo tee /etc/clamav/clamd.conf > /dev/null <<EOF
# Configuración de ClamD para MAAT
LogFile /var/log/clamav/clamav.log
LogTime yes
LogClean yes
LogVerbose yes
PidFile /var/run/clamav/clamd.pid
DatabaseDirectory /var/lib/clamav
LocalSocket /var/run/clamav/clamd.ctl
FixStaleSocket yes
MaxConnectionQueueLength 15
MaxThreads 12
ReadTimeout 180
CommandReadTimeout 30
SendBufTimeout 200
MaxQueue 100
IdleTimeout 30
ExcludePath ^/proc/
ExcludePath ^/sys/
ScanMail yes
ScanArchive yes
ArchiveBlockEncrypted no
ScanPE yes
ScanELF yes
ScanOLE2 yes
ScanPDF yes
ScanSWF yes
ScanHTML yes
ScanXMLDOCS yes
ScanHWP3 yes
ScanOneNote yes
ScanScript yes
MaxScanSize 100M
MaxFileSize 25M
MaxRecursion 16
MaxFiles 10000
MaxEmbeddedPE 10M
MaxHTMLNormalize 10M
MaxHTMLNoTags 2M
MaxScriptNormalize 5M
MaxZipTypeRcg 1M
HeuristicScanPrecedence yes
StructuredDataDetection yes
StructuredMinCreditCardCount 3
StructuredMinSSNCount 3
StructuredSSNFormatNormal yes
StructuredSSNFormatStripped yes
ScanControlFlow yes
CrossFilesystems yes
FollowDirectorySymlinks no
FollowFileSymlinks no
EOF
fi

# Crear directorios necesarios
sudo mkdir -p /var/log/clamav
sudo mkdir -p /var/lib/clamav
sudo mkdir -p /var/run/clamav

# Establecer permisos correctos
sudo chown -R clamav:clamav /var/log/clamav
sudo chown -R clamav:clamav /var/lib/clamav
sudo chown -R clamav:clamav /var/run/clamav

# Actualizar base de datos de virus
echo "🔄 Actualizando base de datos de firmas de virus..."
sudo freshclam

# Verificar instalación
echo "🔍 Verificando instalación..."
if command -v clamscan &> /dev/null; then
    echo "✅ ClamAV instalado correctamente"
    clamscan --version
    
    # Test básico
    echo "🧪 Ejecutando test básico..."
    echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
    if clamscan /tmp/eicar.txt | grep -q "FOUND"; then
        echo "✅ Test de detección exitoso"
        rm -f /tmp/eicar.txt
    else
        echo "⚠️ Test de detección falló - verificar configuración"
    fi
else
    echo "❌ Error en la instalación de ClamAV"
    exit 1
fi

# Crear servicio systemd si es necesario
if systemctl --version &> /dev/null; then
    echo "⚙️ Configurando servicio systemd..."
    sudo systemctl enable clamav-daemon
    sudo systemctl enable clamav-freshclam
    sudo systemctl start clamav-freshclam
    
    # Esperar a que se actualicen las firmas
    echo "⏳ Esperando actualización de firmas..."
    sleep 10
    
    sudo systemctl start clamav-daemon
    echo "✅ Servicios de ClamAV iniciados"
fi

echo ""
echo "🎉 Instalación de ClamAV completada exitosamente!"
echo ""
echo "📋 Próximos pasos:"
echo "1. El escáner de virus MAAT detectará automáticamente ClamAV"
echo "2. Las firmas se actualizarán automáticamente cada 6 horas"
echo "3. Los archivos maliciosos serán cuarentenados automáticamente"
echo ""
echo "📁 Directorios importantes:"
echo "   - Configuración: /etc/clamav/"
echo "   - Logs: /var/log/clamav/"
echo "   - Base de datos: /var/lib/clamav/"
echo "   - Cuarentena MAAT: ./quarantine/"
echo ""
echo "🔧 Comandos útiles:"
echo "   - Actualizar firmas: sudo freshclam"
echo "   - Estado del servicio: sudo systemctl status clamav-daemon"
echo "   - Escanear archivo: clamscan archivo.txt"
echo ""
