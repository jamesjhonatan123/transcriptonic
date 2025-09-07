// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const geminiApiKeyInput = document.querySelector("#gemini-api-key")
  const geminiModelSelect = document.querySelector("#gemini-model")
  const saveApiKeyButton = document.querySelector("#save-api-key")
  const testApiKeyButton = document.querySelector("#test-api-key")
  // Assistant icon controls
  const iconTypeSelect = document.querySelector('#assistant-icon-type')
  const emojiInput = document.querySelector('#assistant-emoji')
  const imageInput = document.querySelector('#assistant-image')
  const chooseImageBtn = document.querySelector('#choose-image')
  const preview = document.querySelector('#assistant-preview')
  const saveIconBtn = document.querySelector('#save-assistant-icon')

  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  // Load Gemini API key and model
  chrome.storage.sync.get(["geminiApiKey", "geminiModel"], function (result) {
    if (result.geminiApiKey && geminiApiKeyInput instanceof HTMLInputElement) {
      geminiApiKeyInput.value = result.geminiApiKey
    }
    if (result.geminiModel && geminiModelSelect instanceof HTMLSelectElement) {
      geminiModelSelect.value = result.geminiModel
    } else if (geminiModelSelect instanceof HTMLSelectElement) {
      geminiModelSelect.value = "gemini-2.5-flash" // default
    }
  })

  // Load assistant icon settings
  chrome.storage.sync.get(['aiAssistantIconType', 'aiAssistantEmoji'], (syncCfg) => {
    chrome.storage.local.get(['aiAssistantImageDataUrl'], (localCfg) => {
      if (iconTypeSelect instanceof HTMLSelectElement) {
        iconTypeSelect.value = syncCfg.aiAssistantIconType || 'emoji'
      }
      if (emojiInput instanceof HTMLInputElement) {
        emojiInput.value = syncCfg.aiAssistantEmoji || '🤖'
      }
      if (preview instanceof HTMLElement) {
        updatePreview(preview, iconTypeSelect?.value || 'emoji', emojiInput?.value || '🤖', localCfg.aiAssistantImageDataUrl)
      }
      toggleIconInputs()
    })
  })

  // Utilitário: constrói o template padrão customizado
  function buildCustomDefaultTemplate() {
    const content = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumo da Reunião - Módulo de Movimentações</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .timeline-item::before { content: ''; position: absolute; left: -2.75rem; top: 0; width: 2px; height: 100%; background-color: #cbd5e1; }
    .timeline-item:first-child::before { top: 0.5rem; }
    .timeline-item:last-child::before { height: 0.5rem; }
    .timeline-icon { position: absolute; left: -3.5rem; top: 0.25rem; width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: #4f46e5; color: white; z-index: 10; }
  </style>
  </head>
<body class="bg-gray-100 p-4 sm:p-6 md:p-8">
  <div class="max-w-5xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
    <header class="bg-indigo-600 text-white p-6 md:p-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold">Desenvolvimento do Módulo de Movimentações</h1>
          <p class="text-indigo-200 mt-1">Data: 05 de Agosto de 2025</p>
        </div>
        <div class="text-4xl">
          <i class="fas fa-people-arrows"></i>
        </div>
      </div>
    </header>
    <main class="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2">
        <section>
          <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-tasks text-blue-500 mr-3"></i>
            Plano de Ação para o Novo Módulo
          </h2>
          <div class="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-lg">
            <p class="text-gray-700">O objetivo é construir um módulo robusto para gerir todas as movimentações de pessoal (Lotação, Férias, Afastamento, Progressão, Averbação), começando pela <strong class="text-indigo-700">Lotação</strong>.</p>
          </div>
        </section>
        <section class="mt-8">
          <h2 class="text-xl font-bold text-gray-800 mb-6 flex items-center">
            <i class="fas fa-shoe-prints text-green-500 mr-3"></i>
            Passos para o Desenvolvimento
          </h2>
          <div class="relative ml-10">
            <div class="timeline-item relative pb-8">
              <div class="timeline-icon"><i class="fas fa-database"></i></div>
              <h3 class="font-semibold text-gray-800">1. Modelagem das Tabelas</h3>
              <p class="text-sm text-gray-600 mb-2">Responsável: Luiz</p>
              <p class="text-gray-700 text-sm">Analisar as tabelas do sistema de RH atual, adaptar a estrutura para o padrão do PC Digital e modelar as novas tabelas em nosso banco de dados, começando pela Lotação.</p>
            </div>
            <div class="timeline-item relative pb-8">
              <div class="timeline-icon"><i class="fas fa-code"></i></div>
              <h3 class="font-semibold text-gray-800">2. Desenvolvimento do Backend</h3>
               <p class="text-sm text-gray-600 mb-2">Responsável: Equipa</p>
              <p class="text-gray-700 text-sm">Criar os \`controllers\` e \`services\` para a funcionalidade de Lotação, implementando toda a lógica de negócio necessária para as operações de CRUD (Criar, Ler, Atualizar, Apagar).</p>
            </div>
            <div class="timeline-item relative pb-8">
              <div class="timeline-icon"><i class="fas fa-palette"></i></div>
              <h3 class="font-semibold text-gray-800">3. Desenvolvimento do Frontend</h3>
               <p class="text-sm text-gray-600 mb-2">Responsáveis: Jéssica & Equipa</p>
               <p class="text-gray-700 text-sm">Com base no fluxo desenhado no Figma, desenvolver as telas de listagem e formulários (adição/edição) para cada tipo de movimentação, garantindo uma interface intuitiva.</p>
            </div>
             <div class="timeline-item relative pb-8">
              <div class="timeline-icon"><i class="fas fa-check-double"></i></div>
              <h3 class="font-semibold text-gray-800">4. Padronização e Validação</h3>
               <p class="text-sm text-gray-600 mb-2">Responsável: Eklebeson</p>
              <p class="text-gray-700 text-sm">Definir e padronizar os campos necessários para cada movimentação (ex: Nº Portaria, Data de Publicação) e garantir que o sistema valide as informações para manter a consistência dos dados.</p>
            </div>
          </div>
        </section>
      </div>
      <div class="lg:col-span-1 space-y-6">
        <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 class="font-bold text-lg text-blue-800 mb-3">Tipos de Movimentação</h3>
          <ul class="list-disc list-inside text-blue-900 text-sm space-y-2">
            <li><i class="fas fa-map-marker-alt mr-2"></i>Lotação</li>
            <li><i class="fas fa-umbrella-beach mr-2"></i>Férias</li>
            <li><i class="fas fa-user-clock mr-2"></i>Afastamento</li>
            <li><i class="fas fa-chart-line mr-2"></i>Progressão</li>
            <li><i class="fas fa-file-signature mr-2"></i>Averbação</li>
            <li><i class="fas fa-user-tag mr-2"></i>Função</li>
          </ul>
        </div>
        <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 class="font-bold text-lg text-yellow-800 mb-3 flex items-center">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            Pontos de Atenção
          </h3>
          <ul class="list-disc list-inside text-yellow-900 text-sm space-y-1">
            <li>Cada tipo de movimentação possui campos e regras de negócio distintas.</li>
            <li>Decidir se os dados serão migrados ou se o novo módulo será o ponto de partida.</li>
            <li>Garantir que a falta de publicação de portarias em Diário Oficial seja tratada pelo sistema.</li>
          </ul>
        </div>
        <div class="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 class="font-bold text-lg text-green-800 mb-3">Próximos Passos</h3>
          <div class="text-left text-green-900 text-sm space-y-2">
             <p><i class="fas fa-chalkboard-teacher mr-2"></i>Jéssica apresentar o protótipo do Figma.</p>
             <p><i class="fas fa-database mr-2"></i>Luiz iniciar a modelagem da tabela de Lotação.</p>
             <p><i class="fas fa-users-cog mr-2"></i>Equipa definir os campos para cada movimentação.</p>
          </div>
        </div>
      </div>
    </main>
  </div>
  </body>
  </html>`

    return {
      id: 'modelo-padrao',
      name: 'Modelo padrão',
      content,
      createdAt: new Date().toISOString()
    }
  }

  // Criar apenas o template customizado no primeiro uso
  chrome.storage.sync.get(["aiTemplates", "defaultTemplatesCreated"], function (result) {
    if (!result.defaultTemplatesCreated) {
      const onlyCustom = [buildCustomDefaultTemplate()]
      chrome.storage.sync.set({ aiTemplates: onlyCustom, defaultTemplatesCreated: true })
    }
  })

  function toggleIconInputs() {
    if (!(iconTypeSelect instanceof HTMLSelectElement)) return
    const isImage = iconTypeSelect.value === 'image'
    if (emojiInput instanceof HTMLInputElement) {
      emojiInput.style.display = isImage ? 'none' : 'block'
    }
    if (chooseImageBtn instanceof HTMLButtonElement) {
      chooseImageBtn.style.display = isImage ? 'inline-block' : 'none'
    }
  }

  function updatePreview(container, type, emoji, dataUrl) {
    container.innerHTML = ''
    if (type === 'image' && dataUrl) {
      const img = document.createElement('img')
      img.src = dataUrl
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      container.appendChild(img)
    } else {
      const span = document.createElement('span')
      span.textContent = emoji || '🤖'
      span.style.fontSize = '20px'
      container.appendChild(span)
    }
  }

  if (iconTypeSelect instanceof HTMLSelectElement) {
    iconTypeSelect.addEventListener('change', () => {
      toggleIconInputs()
      if (preview instanceof HTMLElement) {
        updatePreview(preview, iconTypeSelect.value, (emojiInput instanceof HTMLInputElement ? emojiInput.value : '🤖'), null)
      }
    })
  }

  if (chooseImageBtn instanceof HTMLButtonElement) {
    chooseImageBtn.addEventListener('click', (e) => {
      e.preventDefault()
      // Abre página dedicada em nova aba/janela para evitar fechamento automático do popup
      chrome.tabs?.create
        ? chrome.tabs.create({ url: chrome.runtime.getURL('icon-settings.html') })
        : window.open('icon-settings.html', '_blank')
    })
  }

  if (saveIconBtn instanceof HTMLButtonElement) {
    saveIconBtn.addEventListener('click', () => {
      const type = (iconTypeSelect instanceof HTMLSelectElement) ? iconTypeSelect.value : 'emoji'
      const emoji = (emojiInput instanceof HTMLInputElement) ? (emojiInput.value || '🤖') : '🤖'
      const pendingImage = (imageInput instanceof HTMLInputElement) ? imageInput.dataset.previewDataUrl : undefined

      chrome.storage.sync.set({ aiAssistantIconType: type, aiAssistantEmoji: emoji }, () => {
        if (type === 'image' && pendingImage) {
          chrome.storage.local.set({ aiAssistantImageDataUrl: pendingImage }, () => feedbackSaved())
        } else {
          feedbackSaved()
        }
      })
    })
  }

  function feedbackSaved() {
    if (!(saveIconBtn instanceof HTMLButtonElement)) return
    const old = saveIconBtn.textContent
    saveIconBtn.textContent = 'Salvo!'
    saveIconBtn.style.background = '#28a745'
    setTimeout(() => {
      saveIconBtn.textContent = old || 'Salvar'
      saveIconBtn.style.background = '#2A9ACA'
    }, 1200)
  }

  // Save Gemini API key and model
  if (saveApiKeyButton instanceof HTMLButtonElement && geminiApiKeyInput instanceof HTMLInputElement && geminiModelSelect instanceof HTMLSelectElement) {
    saveApiKeyButton.addEventListener("click", function () {
      const apiKey = geminiApiKeyInput.value.trim()
      const model = geminiModelSelect.value
      if (apiKey) {
        chrome.storage.sync.set({
          geminiApiKey: apiKey,
          geminiModel: model
        }, function () {
          // Visual feedback
          saveApiKeyButton.textContent = "Salvo!"
          saveApiKeyButton.style.background = "#28a745"
          setTimeout(() => {
            saveApiKeyButton.textContent = "Salvar Configuração"
            saveApiKeyButton.style.background = "#2A9ACA"
          }, 2000)
        })
      } else {
        alert("Por favor, insira uma chave de API válida")
      }
    })
  }

  // Test Gemini API key
  if (testApiKeyButton instanceof HTMLButtonElement && geminiApiKeyInput instanceof HTMLInputElement && geminiModelSelect instanceof HTMLSelectElement) {
    testApiKeyButton.addEventListener("click", async function () {
      const apiKey = geminiApiKeyInput.value.trim()
      const model = geminiModelSelect.value
      if (!apiKey) {
        alert("Por favor, insira uma chave de API primeiro")
        return
      }

      testApiKeyButton.textContent = "Testando..."
      testApiKeyButton.disabled = true

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Olá, esta é uma mensagem de teste. Por favor, responda com 'Chave da API funcionando corretamente.'"
              }]
            }]
          })
        })

        if (response.ok) {
          testApiKeyButton.textContent = "✓ Válida"
          testApiKeyButton.style.background = "#28a745"
          testApiKeyButton.style.color = "white"
          setTimeout(() => {
            testApiKeyButton.textContent = "Testar"
            testApiKeyButton.style.background = "transparent"
            testApiKeyButton.style.color = "#2A9ACA"
          }, 3000)
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        testApiKeyButton.textContent = "✗ Inválida"
        testApiKeyButton.style.background = "#dc3545"
        testApiKeyButton.style.color = "white"
        setTimeout(() => {
          testApiKeyButton.textContent = "Testar"
          testApiKeyButton.style.background = "transparent"
          testApiKeyButton.style.color = "#2A9ACA"
        }, 3000)
      } finally {
        testApiKeyButton.disabled = false
      }
    })
  }

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === undefined) {
        autoModeRadio.checked = true
      }
      else if (resultSync.operationMode === "auto") {
        autoModeRadio.checked = true
      }
      else if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      }

      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })
}