// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

// ==== Helpers de Templates (definidos antes de qualquer uso) ====
const TEMPLATE_STORAGE_KEY = 'aiTemplatesV2'
const TEMPLATE_MAX_LEN = 80 * 1024 // ~80KB por item (aprox.)

function getTemplateStore() {
    // Usar local para evitar limites do sync
    return chrome.storage.local
}

function safeStorageGet(keys, cb) {
    try {
        getTemplateStore().get(keys, (result) => {
            const err = chrome.runtime.lastError
            if (err) {
                console.error('Erro ao ler storage:', err.message)
            }
            cb(result || {})
        })
    } catch (e) {
        console.error('Erro inesperado no get:', e)
        cb({})
    }
}

function safeStorageSet(items, cb) {
    try {
        const size = new Blob([JSON.stringify(items)]).size
        if (size > TEMPLATE_MAX_LEN * 5) {
            alert('Template muito grande para salvar. Reduza o conteúdo.')
            return
        }
    } catch {}
    getTemplateStore().set(items, () => {
        const err = chrome.runtime.lastError
        if (err) {
            console.error('Erro ao gravar storage:', err.message)
            alert('Falha ao salvar no storage: ' + err.message)
            return
        }
        cb && cb()
    })
}

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            /** @type {ExtensionMessage} */
            const message = {
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Last meeting recovered successfully!")
                    }
                }
                else {
                    if (response.message === "No meetings found. May be attend one?") {
                        alert(response.message)
                    }
                    else if (response.message === "Empty transcript and empty chatMessages") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Could not recover last meeting!")
                        console.error(response.message)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }
            // Set checkbox state, default to true if not set
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting !== false
            // Set radio button state, default to simple if not set
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.value || !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl,
                        autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
                        webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple"
                    }, function () {
                        alert("Webhook URL saved!")
                    })
                }).catch((error) => {
                    alert("Fine! No webhooks for you!")
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () { })
        })

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }

    // Initialize AI Features (with retry mechanism)
    setTimeout(() => initializeAIFeatures(), 100)
    setTimeout(() => initializeAIFeatures(), 500)
    setTimeout(() => initializeAIFeatures(), 1000)
})


// Request runtime permission for webhook URL
/**
 * @param {string} url
 */
function requestWebhookAndNotificationPermission(url) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // Request both host and notifications permissions
            chrome.permissions.request({
                origins: [originPattern],
                permissions: ["notifications"]
            }).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

// Load and display recent transcripts
function loadMeetings() {
    const meetingsTable = document.querySelector('#transcripts-table')

    chrome.storage.local.get(['meetings'], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
        if (meetingsTable) {
            meetingsTable.innerHTML = ''
            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                for (let i = resultLocal.meetings.length - 1; i >= 0; i--) {
                    const meeting = resultLocal.meetings[i]
                    const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)
                    const row = document.createElement('tr')
                    row.innerHTML = `
                        <td>${meeting.meetingTitle || meeting.title || 'Google Meet call'}</td>
                        <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                        <td>
                            ${(() => { switch (meeting.webhookPostStatus) { case 'successful': return `<span class="status-success">Successful</span>`; case 'failed': return `<span class="status-failed">Failed</span>`; case 'new': return `<span class="status-new">New</span>`; default: return `<span class="status-new">Unknown</span>` }})()}
                        </td>
                        <td>
                            <div style="min-width: 200px; display: flex; gap: 0.5rem; align-items: center;">
                                <button class="download-button" data-index="${i}" style="background:#28a745;color:white;border:none;padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:12px;">
                                    Download
                                </button>
                                <button class="post-button" data-index="${i}" style="background:#6c757d;color:white;border:none;padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:12px;">
                                    ${meeting.webhookPostStatus === "new" ? "Post" : "Repost"}
                                </button>
                                <button data-generate data-index="${i}" style="background:#2A9ACA;color:white;border:none;padding:0.35rem 0.75rem;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">
                                    Gerar resumo
                                </button>
                            </div>
                        </td>
                    `
                    meetingsTable.appendChild(row)

                    // Add event listener to the download button
                    const downloadButton = row.querySelector(".download-button")
                    if (downloadButton instanceof HTMLButtonElement) {
                        downloadButton.addEventListener("click", function () {
                            // Send message to background script to download text file
                            const index = parseInt(downloadButton.getAttribute("data-index") ?? "-1")
                            /** @type {ExtensionMessage} */
                            const message = {
                                type: "download_transcript_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                loadMeetings()
                                if (!response.success) {
                                    alert("Não foi possível baixar a transcrição")
                                }
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const webhookPostButton = row.querySelector(".post-button")
                    if (webhookPostButton instanceof HTMLButtonElement) {
                        webhookPostButton.addEventListener("click", function () {
                            chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
                                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                                if (resultSync.webhookUrl) {
                                    // Request runtime permission for the webhook URL
                                    requestWebhookAndNotificationPermission(resultSync.webhookUrl).then(() => {
                                        // Disable button and update text
                                        webhookPostButton.disabled = true
                                        webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                                        // Send message to background script to post webhook
                                        const index = parseInt(webhookPostButton.getAttribute("data-index") ?? "-1")
                                        /** @type {ExtensionMessage} */
                                        const message = {
                                            type: "retry_webhook_at_index",
                                            index: index
                                        }
                                        chrome.runtime.sendMessage(message, (responseUntyped) => {
                                            const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                            loadMeetings()
                                            if (response.success) {
                                                alert("Postado com sucesso!")
                                            }
                                            else {
                                                console.error(response.message)
                                            }
                                        })
                                    }).catch((error) => {
                                        alert("Fine! No webhooks for you!")
                                        console.error("Webhook permission error:", error)
                                    })
                                }
                                else {
                                    alert("Por favor, forneça uma URL de webhook")
                                }
                            })
                        })
                    }
                }
            } else {
                meetingsTable.innerHTML = `<tr><td colspan="4">Sua próxima reunião aparecerá aqui</td></tr>`
            }
        }
        // Ativar UI de geração
        enhanceMeetingsListUI()
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
/**
 * @param {string} meetingStartTimestamp - ISO timestamp
 * @param {string} meetingEndTimestamp - ISO timestamp
 */
function getDuration(meetingStartTimestamp, meetingEndTimestamp) {
    const duration = new Date(meetingEndTimestamp).getTime() - new Date(meetingStartTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}

function initializeAIFeatures() {
    const saveTemplateBtn = document.querySelector("#save-template")
    const templateNameInput = document.querySelector("#template-name")
    const templateContentInput = document.querySelector("#template-content")
    const quickPromptBtns = document.querySelectorAll(".quick-prompt-btn")
    const executeCustomPromptBtn = document.querySelector("#execute-custom-prompt")
    const customPromptInput = document.querySelector("#custom-prompt")
    const aiResponseDiv = document.querySelector("#ai-response")
    const copyResponseBtn = document.querySelector("#copy-response")
    const generatePdfBtn = document.querySelector("#generate-pdf")

    // Debug logging
    console.log("AI Features initialization:")
    console.log("Save Template Button:", saveTemplateBtn)
    console.log("Template Name Input:", templateNameInput)
    console.log("Template Content Input:", templateContentInput)

    // Carregar templates
    loadTemplates()

    // Contador de caracteres para o template
    const charCountDiv = document.querySelector('#template-char-count')
    if (templateContentInput && charCountDiv) {
        const updateCharCount = () => {
            const text = templateContentInput.value
            const byteSize = new Blob([text]).size
            const kbSize = (byteSize / 1024).toFixed(1)
            const maxKb = 80
            const percentage = Math.min(100, (byteSize / (maxKb * 1024)) * 100)
            
            charCountDiv.textContent = `${kbSize}KB / ${maxKb}KB`
            
            // Mudar cor baseado no uso
            if (percentage > 90) {
                charCountDiv.style.color = '#ff6b6b'
                charCountDiv.style.background = 'rgba(255,107,107,0.2)'
            } else if (percentage > 70) {
                charCountDiv.style.color = '#feca57'
                charCountDiv.style.background = 'rgba(254,202,87,0.2)'
            } else {
                charCountDiv.style.color = '#888'
                charCountDiv.style.background = 'rgba(0,0,0,0.7)'
            }
        }
        
        templateContentInput.addEventListener('input', updateCharCount)
        templateContentInput.addEventListener('paste', () => setTimeout(updateCharCount, 10))
        updateCharCount() // Inicializar
    }

    // Salvamento com validação de tamanho e tratamento de erros
    if (saveTemplateBtn && templateNameInput && templateContentInput && !saveTemplateBtn.hasAttribute('data-listener-added')) {
        saveTemplateBtn.setAttribute('data-listener-added', 'true')
        saveTemplateBtn.addEventListener('click', () => {
            const name = templateNameInput.value.trim()
            const content = templateContentInput.value.trim()
            if (!name || !content) {
                alert('Por favor, preencha o nome e o conteúdo do template')
                return
            }
            // Checagem de tamanho
            const approxSize = new Blob([content]).size
            if (approxSize > TEMPLATE_MAX_LEN) {
                if (!confirm('O template é grande (~' + Math.round(approxSize/1024) + 'KB). Salvar mesmo assim?')) {
                    return
                }
            }

            safeStorageGet([TEMPLATE_STORAGE_KEY], (result) => {
                const templates = result[TEMPLATE_STORAGE_KEY] || []
                const newTemplate = { id: Date.now().toString(), name, content, createdAt: new Date().toISOString() }
                templates.push(newTemplate)
                const saveObj = {}
                saveObj[TEMPLATE_STORAGE_KEY] = templates
                safeStorageSet(saveObj, () => {
                    templateNameInput.value = ''
                    templateContentInput.value = ''
                    // Atualizar contador
                    const charCountDiv = document.querySelector('#template-char-count')
                    if (charCountDiv) charCountDiv.textContent = '0KB / 80KB'
                    loadTemplates()
                    alert('Template salvo com sucesso!')
                })
            })
        })
    }

    // Delegação de eventos para Usar/Excluir
    const templatesList = document.querySelector('#templates-list')
    if (templatesList && !templatesList.hasAttribute('data-delegate')) {
        templatesList.setAttribute('data-delegate', 'true')
        templatesList.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */(e.target)
            const btn = target.closest('[data-action]')
            if (!btn) return
            const action = btn.getAttribute('data-action')
            const id = btn.getAttribute('data-id')
            if (!id) return
            if (action === 'use') {
                useTemplate(id)
            } else if (action === 'delete') {
                deleteTemplate(id)
            }
        })
    }

    // Quick prompts functionality
    quickPromptBtns.forEach(btn => {
        btn.addEventListener("click", function() {
            const prompt = this.dataset.prompt
            executePrompt(prompt)
        })
    })

    // Custom prompt functionality
    if (executeCustomPromptBtn && customPromptInput) {
        executeCustomPromptBtn.addEventListener("click", function() {
            const prompt = customPromptInput.value.trim()
            if (!prompt) {
                alert("Please enter a custom prompt")
                return
            }
            executePrompt(prompt)
        })
    }

    // Copy response functionality
    if (copyResponseBtn && aiResponseDiv) {
        copyResponseBtn.addEventListener("click", function() {
            const text = aiResponseDiv.textContent
            if (text && text !== "AI responses will appear here...") {
                navigator.clipboard.writeText(text).then(() => {
                    copyResponseBtn.textContent = "✓ Copied!"
                    setTimeout(() => {
                        copyResponseBtn.textContent = "📋 Copy"
                    }, 2000)
                })
            }
        })
    }

    // Generate PDF functionality
    if (generatePdfBtn && aiResponseDiv) {
        generatePdfBtn.addEventListener("click", function() {
            const content = aiResponseDiv.textContent
            if (content && content !== "AI responses will appear here...") {
                generatePDF(content)
            } else {
                alert("No AI response to generate PDF from")
            }
        })
    }
}

// Utilidades de migração/fallback dos templates
async function loadAllTemplatesWithFallback() {
    return new Promise((resolve) => {
        // Buscar em local v2, local v1 e sync v1
        const done = (arr) => resolve(arr || [])
        safeStorageGet([TEMPLATE_STORAGE_KEY, 'aiTemplates'], (localRes) => {
            const v2 = localRes[TEMPLATE_STORAGE_KEY]
            const v1Local = localRes['aiTemplates']
            if (v2 && Array.isArray(v2) && v2.length) return done(v2)
            // tentar sync.v1
            chrome.storage.sync.get(['aiTemplates'], (syncRes) => {
                const v1Sync = syncRes && Array.isArray(syncRes.aiTemplates) ? syncRes.aiTemplates : []
                const merged = (v1Local || []).concat(v1Sync || [])
                // Migrar se houver algo
                if (merged.length) {
                    const saveObj = {}; saveObj[TEMPLATE_STORAGE_KEY] = merged
                    safeStorageSet(saveObj, () => done(merged))
                } else {
                    done([])
                }
            })
        })
    })
}

function ensureAiResponseContainer() {
    let el = document.querySelector('#ai-response')
    if (!el) {
        const host = document.querySelector('.grid-container') || document.body
        const wrap = document.createElement('div')
        wrap.className = 'card'
        wrap.style.padding = '1rem 1.5rem'
        wrap.innerHTML = `<p class="card-heading">Resposta da IA</p><div id="ai-response" class="code-block">Aguardando…</div>`
        host.appendChild(wrap)
        el = wrap.querySelector('#ai-response')
    }
    return /** @type {HTMLElement} */(el)
}

function loadTemplates() {
    console.log('Loading templates...')
    loadAllTemplatesWithFallback().then((templates) => {
        const templatesList = document.querySelector('#templates-list')
        if (!templatesList) return
        if (!templates.length) {
            templatesList.innerHTML = '<p class="sub-text">Nenhum template salvo ainda</p>'
            return
        }
        templatesList.innerHTML = templates.map(t => `
            <div class="template-item" style="display:flex;justify-content:space-between;align-items:center;padding:1rem;margin-bottom:0.5rem;background:rgba(255,255,255,0.05);border-radius:4px;">
                <div>
                    <strong>${escapeHtml(t.name)}</strong><br>
                    <span class="sub-text">Criado em ${new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="template-actions" style="display:flex;gap:0.5rem;">
                    <button data-action="use" data-id="${t.id}" style="background:#2A9ACA;color:#fff;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">Usar</button>
                    <button data-action="delete" data-id="${t.id}" style="background:#dc3545;color:#fff;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">Excluir</button>
                </div>
            </div>
        `).join('')
    })
}

function useTemplate(templateId) {
    // Garantir container de resposta e feedback
    const aiResponseDiv = ensureAiResponseContainer()
    aiResponseDiv.textContent = 'Preparando…'
    loadAllTemplatesWithFallback().then((templates) => {
        const template = templates.find(t => t.id === templateId)
        if (!template) { aiResponseDiv.textContent = 'Template não encontrado.'; return }
        // Validar API key
        chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (cfg) => {
            if (!cfg || !cfg.geminiApiKey) {
                alert('Configure sua chave da API Gemini no popup da extensão.')
                aiResponseDiv.textContent = 'API não configurada.'
                return
            }
            aiResponseDiv.textContent = 'Gerando resumo…'
            getCurrentMeetingData().then(meetingData => {
                if (!meetingData) {
                    aiResponseDiv.textContent = 'Sem dados de reunião. Entre em uma reunião ou recupere a última.'
                    return
                }
                const prompt = `Usando este template: ${template.content}\n\nPor favor, gere um resumo usando os seguintes dados da reunião:\nTítulo da Reunião: ${meetingData.title}\nData: ${meetingData.date}\nParticipantes: ${meetingData.participants}\nTranscrição: ${meetingData.transcript}\n\nSubstitua os placeholders {{summary}}, {{date}}, {{participants}}.`
                executePrompt(prompt)
                window.scrollTo({ top: aiResponseDiv.getBoundingClientRect().top + window.scrollY - 40, behavior: 'smooth' })
            })
        })
    })
}

function deleteTemplate(templateId) {
    loadAllTemplatesWithFallback().then((templates) => {
        if (!confirm('Tem certeza que deseja excluir este template?')) return
        const updated = templates.filter(t => t.id !== templateId)
        const saveObj = {}; saveObj[TEMPLATE_STORAGE_KEY] = updated
        safeStorageSet(saveObj, () => {
            loadTemplates()
            alert('Template excluído com sucesso!')
        })
    })
}

function openTemplatePickerAndGenerate(meetingIndex) {
    // Validar API e preparar resposta
    const aiResponseDiv = ensureAiResponseContainer()
    aiResponseDiv.textContent = 'Preparando…'
    
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (cfg) => {
        if (!cfg || !cfg.geminiApiKey) {
            alert('Configure sua chave da API Gemini no popup da extensão.')
            aiResponseDiv.textContent = 'API não configurada.'
            return
        }
        
        loadAllTemplatesWithFallback().then((templates) => {
            if (!templates.length) { 
                alert('Nenhum template salvo. Crie um template primeiro.') 
                return 
            }
            
            const names = templates.map((t, i) => `${i+1}. ${t.name}`).join('\n')
            const pick = prompt('Escolha um template pelo número:\n' + names)
            const idx = pick ? (parseInt(pick, 10) - 1) : -1
            if (idx < 0 || idx >= templates.length) return
            
            const selected = templates[idx]
            aiResponseDiv.textContent = 'Gerando resumo…'
            
            // Obter dados específicos da reunião pelo índice
            chrome.storage.local.get(['meetings'], function(resultLocal) {
                const meetings = resultLocal.meetings || []
                if (meetingIndex >= meetings.length) {
                    aiResponseDiv.textContent = 'Reunião não encontrada.'
                    return
                }
                
                const meeting = meetings[meetingIndex]
                if (!meeting || !meeting.transcript || meeting.transcript.length === 0) {
                    aiResponseDiv.textContent = 'Esta reunião não possui transcrição disponível.'
                    return
                }
                
                // Preparar dados da reunião específica
                const meetingData = {
                    title: meeting.meetingTitle || meeting.title || 'Reunião do Google Meet',
                    date: new Date(meeting.meetingStartTimestamp).toLocaleDateString('pt-BR'),
                    duration: getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp),
                    participants: [...new Set(meeting.transcript.map(t => t.personName))].join(', '),
                    transcript: meeting.transcript.map(t => `${t.personName}: ${t.transcriptText}`).join('\n')
                }
                
                // Gerar prompt com template e dados da reunião
                const prompt = `Usando este template HTML: ${selected.content}

Por favor, gere um resumo da reunião substituindo os placeholders pelos dados reais:

DADOS DA REUNIÃO:
- Título: ${meetingData.title}
- Data: ${meetingData.date}
- Duração: ${meetingData.duration}
- Participantes: ${meetingData.participants}

TRANSCRIÇÃO COMPLETA:
${meetingData.transcript}

INSTRUÇÕES:
1. Substitua {{summary}} por um resumo detalhado dos pontos principais
2. Substitua {{date}} por: ${meetingData.date}
3. Substitua {{participants}} por: ${meetingData.participants}
4. Substitua {{title}} por: ${meetingData.title} (se usado no template)
5. Substitua {{duration}} por: ${meetingData.duration} (se usado no template)
6. Mantenha toda a formatação HTML do template
7. Retorne apenas o HTML final processado, sem explicações adicionais`
                
                executePrompt(prompt)
                window.scrollTo({ top: aiResponseDiv.getBoundingClientRect().top + window.scrollY - 40, behavior: 'smooth' })
            })
        })
    })
}

// Expor no escopo global como fallback (para onclicks remanescentes)
// @ts-ignore
window.useTemplate = useTemplate
// @ts-ignore
window.deleteTemplate = deleteTemplate

// Adicionar botão "Gerar resumo" nas últimas reuniões
function enhanceMeetingsListUI() {
    const table = document.querySelector('#transcripts-table')
    if (!table || table.hasAttribute('data-enhanced')) return
    table.setAttribute('data-enhanced', 'true')
    // Adiciona um cabeçalho extra se necessário (opcional)
    // Delegação de eventos para gerar resumo com template selecionado
    table.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */(e.target)
        const btn = target.closest('[data-generate]')
        if (!btn) return
        const meetingIndex = btn.getAttribute('data-index')
        openTemplatePickerAndGenerate(Number(meetingIndex))
    })
}

// Chamar após carregar a lista de reuniões
enhanceMeetingsListUI()

// Funções auxiliares que estavam faltando
function escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

async function getCurrentMeetingData() {
    return new Promise((resolve) => {
        // Try to get current meeting data from the extension
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentTab = tabs[0]
            if (currentTab && currentTab.url && currentTab.url.includes('meet.google.com')) {
                // Get the latest meeting data
                chrome.storage.local.get(null, function(items) {
                    const meetings = Object.keys(items)
                        .filter(key => key.startsWith('meeting_'))
                        .map(key => items[key])
                        .sort((a, b) => new Date(b.meetingStartTimestamp) - new Date(a.meetingStartTimestamp))
                    
                    if (meetings.length > 0) {
                        const latestMeeting = meetings[0]
                        resolve({
                            title: latestMeeting.meetingTitle || "Current Meeting",
                            date: new Date().toLocaleDateString('pt-BR'),
                            participants: latestMeeting.transcript ? 
                                [...new Set(latestMeeting.transcript.map(t => t.personName))].join(", ") : 
                                "Unknown",
                            transcript: latestMeeting.transcript ? 
                                latestMeeting.transcript.map(t => `${t.personName}: ${t.transcriptText}`).join("\n") :
                                "No transcript available"
                        })
                    } else {
                        resolve(null)
                    }
                })
            } else {
                resolve(null)
            }
        })
    })
}

async function executePrompt(prompt) {
    const aiResponseDiv = document.querySelector("#ai-response") || ensureAiResponseContainer()
    const executeBtn = document.querySelector("#execute-custom-prompt")
    
    if (!aiResponseDiv) return

    // Check if API key is configured
    chrome.storage.sync.get(["geminiApiKey", "geminiModel"], async function(result) {
        if (!result.geminiApiKey) {
            aiResponseDiv.textContent = "Por favor, configure sua chave da API Gemini no popup da extensão primeiro."
            return
        }

        const model = result.geminiModel || 'gemini-2.5-flash'

        try {
            aiResponseDiv.textContent = "Gerando resposta..."
            if (executeBtn) executeBtn.disabled = true

            // Get current meeting transcript for context
            const meetingData = await getCurrentMeetingData()
            const contextualPrompt = meetingData 
                ? `Contexto: Transcrição da reunião atual: ${meetingData.transcript}\n\nSolicitação do usuário: ${prompt}`
                : prompt

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${result.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: contextualPrompt
                        }]
                    }]
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()
            const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nenhuma resposta gerada"
            aiResponseDiv.textContent = aiResponse

        } catch (error) {
            console.error("Falha na solicitação à IA:", error)
            aiResponseDiv.textContent = `Erro: ${error.message}`
        } finally {
            if (executeBtn) executeBtn.disabled = false
        }
    })
}

async function generatePDF(content) {
    try {
        // Limpar marcadores de código como ```html do conteúdo
        let cleanContent = content
            .replace(/```html\s*/g, '')
            .replace(/```\s*/g, '')
            .trim()
        
        // Verificar se o conteúdo já é HTML ou se é texto simples
        const isHtmlContent = cleanContent.trim().startsWith('<') || cleanContent.includes('<html')
        
        let htmlContent
        if (isHtmlContent) {
            // Se já é HTML, usar diretamente mas adicionar estilos de impressão
            htmlContent = cleanContent.includes('</head>') 
                ? cleanContent.replace(
                    '</head>',
                    `<style>
                        @media print {
                            body { margin: 0; padding: 20px; }
                            .no-print { display: none !important; }
                        }
                        @page { 
                            margin: 1cm; 
                            size: A4; 
                        }
                        body {
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            background: white;
                        }
                    </style>
                    </head>`
                )
                : `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
                    @page { margin: 1cm; size: A4; }
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: white; margin: 0; padding: 20px; }
                </style></head><body>${cleanContent}</body></html>`
        } else {
            // Se é texto simples, criar HTML estruturado
            htmlContent = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Resumo da Reunião - TranscripTonic</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            line-height: 1.6; 
                            margin: 0;
                            padding: 20px;
                            color: #333;
                            background: white;
                        }
                        h1 { 
                            color: #2A9ACA; 
                            border-bottom: 2px solid #2A9ACA;
                            padding-bottom: 10px;
                            margin-bottom: 20px;
                        }
                        .header { 
                            border-bottom: 2px solid #2A9ACA; 
                            padding-bottom: 10px; 
                            margin-bottom: 20px; 
                        }
                        .content { 
                            white-space: pre-wrap; 
                            background: #f9f9f9;
                            padding: 15px;
                            border-radius: 5px;
                            border-left: 4px solid #2A9ACA;
                        }
                        @page { 
                            margin: 1cm; 
                            size: A4; 
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Resumo da Reunião</h1>
                        <p><strong>Gerado pelo TranscripTonic em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                    <div class="content">${escapeHtml(cleanContent)}</div>
                </body>
                </html>
            `
        }

        // Criar um blob do HTML e usar download direto
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        
        // Criar um link de download temporário
        const a = document.createElement('a')
        a.href = url
        a.download = `resumo-reuniao-${new Date().toISOString().split('T')[0]}.html`
        a.style.display = 'none'
        
        // Adicionar ao DOM, clicar e remover
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        // Limpar a URL do blob
        setTimeout(() => {
            URL.revokeObjectURL(url)
        }, 1000)

    } catch (error) {
        console.error('Erro ao gerar PDF:', error)
        alert('Erro ao gerar arquivo. Tente novamente.')
    }
}