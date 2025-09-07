#!/bin/bash

echo "🔧 Verificação da funcionalidade de templates - TranscripTonic"
echo "============================================================"

# Verificar se o Chrome está disponível
if ! command -v google-chrome &> /dev/null; then
    echo "❌ Google Chrome não encontrado"
    exit 1
fi

echo "✅ Google Chrome encontrado"

# Verificar se a extensão existe
if [ ! -d "extension" ]; then
    echo "❌ Pasta 'extension' não encontrada"
    exit 1
fi

echo "✅ Pasta da extensão encontrada"

# Verificar arquivos principais
files=("extension/manifest.json" "extension/meetings.html" "extension/meetings.js")
for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Arquivo $file não encontrado"
        exit 1
    fi
    echo "✅ $file existe"
done

# Verificar se os IDs necessários existem no HTML
echo ""
echo "🔍 Verificando IDs no HTML..."

if grep -q 'id="template-name"' extension/meetings.html; then
    echo "✅ ID 'template-name' encontrado"
else
    echo "❌ ID 'template-name' não encontrado"
fi

if grep -q 'id="save-template"' extension/meetings.html; then
    echo "✅ ID 'save-template' encontrado" 
else
    echo "❌ ID 'save-template' não encontrado"
fi

if grep -q 'id="templates-list"' extension/meetings.html; then
    echo "✅ ID 'templates-list' encontrado"
else
    echo "❌ ID 'templates-list' não encontrado"
fi

# Verificar se as funções existem no JavaScript
echo ""
echo "🔍 Verificando funções no JavaScript..."

if grep -q "function initializeAIFeatures" extension/meetings.js; then
    echo "✅ Função 'initializeAIFeatures' encontrada"
else
    echo "❌ Função 'initializeAIFeatures' não encontrada"
fi

if grep -q "function loadTemplates" extension/meetings.js; then
    echo "✅ Função 'loadTemplates' encontrada"
else
    echo "❌ Função 'loadTemplates' não encontrada"
fi

if grep -q "function saveTemplate" extension/meetings.js; then
    echo "✅ Função 'saveTemplate' encontrada"
else
    echo "❌ Função 'saveTemplate' não encontrada"
fi

# Verificar a chave de storage
echo ""
echo "🔍 Verificando chave de storage..."

if grep -q "aiTemplates" extension/meetings.js; then
    echo "✅ Chave 'aiTemplates' encontrada no código"
else
    echo "❌ Chave 'aiTemplates' não encontrada"
fi

# Verificar charset UTF-8
echo ""
echo "🔍 Verificando encoding UTF-8..."

if grep -q 'charset="UTF-8"' extension/meetings.html; then
    echo "✅ Charset UTF-8 configurado"
else
    echo "❌ Charset UTF-8 não encontrado"
fi

if grep -q 'lang="pt-BR"' extension/meetings.html; then
    echo "✅ Idioma português configurado"
else
    echo "❌ Idioma português não configurado"
fi

echo ""
echo "✅ Verificação concluída!"
echo ""
echo "📋 Para testar manualmente:"
echo "1. Abra o Chrome: google-chrome --load-extension=extension"
echo "2. Vá para uma reunião do Google Meet"
echo "3. Clique no ícone da extensão"
echo "4. Vá para a aba 'Reuniões' (meetings.html)"
echo "5. Role até a seção de templates"
echo "6. Teste criar um template"
echo "7. Verifique se aparece na lista"
echo ""
echo "🔧 Para depuração:"
echo "1. Abra DevTools (F12)"
echo "2. Vá para Console" 
echo "3. Procure por logs 'AI Features initialization'"
echo "4. Teste criar um template e observe os logs"
