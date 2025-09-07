// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

// ==== Helpers de Templates (definidos antes de qualquer uso) ====
const TEMPLATE_STORAGE_KEY = 'aiTemplatesV2'
const TEMPLATE_MAX_LEN = 80 * 1024 // ~80KB por item (aprox.)
const QUICK_ACTIONS_KEY = 'aiQuickActions'
const DEFAULT_QUICK_ACTIONS = [
    { id: 'q1', icon: '📝', label: 'Generate Questions', prompt: 'Generate 5 relevant questions about the topics discussed so far' },
    { id: 'q2', icon: '📋', label: 'Summarize So Far', prompt: 'Summarize the key points discussed in this meeting so far' },
    { id: 'q3', icon: '✅', label: 'Action Items', prompt: 'List the action items and decisions made in this meeting' },
    { id: 'q4', icon: '🎯', label: 'Key Topics', prompt: 'Identify the main topics and themes discussed' },
]

// Índice da reunião para a qual estamos gerando o resumo via tabela (para salvar e trocar o botão)
let currentGeneratingMeetingIndex = null

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
    } catch { }
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
                    const hasSummary = !!meeting.aiSummaryHtml
                    const actionBtnHtml = hasSummary
                        ? `<button class="download-pdf-button" data-download-pdf data-index="${i}" style="background:#2A9ACA;color:white;border:none;padding:0.35rem 0.75rem;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Baixar PDF</button>`
                        : `<button class="generate-summary-button" data-generate data-index="${i}" style="background:#2A9ACA;color:white;border:none;padding:0.35rem 0.75rem;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Gerar resumo</button>`
                    const row = document.createElement('tr')
                    row.innerHTML = `
                        <td>${meeting.meetingTitle || meeting.title || 'Google Meet call'}</td>
                        <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                        <td>
                            ${(() => { switch (meeting.webhookPostStatus) { case 'successful': return `<span class="status-success">Successful</span>`; case 'failed': return `<span class="status-failed">Failed</span>`; case 'new': return `<span class="status-new">New</span>`; default: return `<span class="status-new">Unknown</span>` } })()}
                        </td>
                        <td>
                            <div style="min-width: 200px; display: flex; gap: 0.5rem; align-items: center;">
                                <button class="download-button" data-index="${i}" style="background:#28a745;color:white;border:none;padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:12px;">
                                    Download
                                </button>
                                <button class="post-button" data-index="${i}" style="background:#6c757d;color:white;border:none;padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;font-size:12px;">
                                    ${meeting.webhookPostStatus === "new" ? "Post" : "Repost"}
                                </button>
                                ${actionBtnHtml}
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
    const restoreDefaultsBtn = document.querySelector('#restore-default-templates')

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
                if (!confirm('O template é grande (~' + Math.round(approxSize / 1024) + 'KB). Salvar mesmo assim?')) {
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

    // Quick prompts dinâmicos
    setupDynamicQuickPrompts()

    // Custom prompt functionality
    if (executeCustomPromptBtn && customPromptInput) {
        executeCustomPromptBtn.addEventListener("click", function () {
            const prompt = customPromptInput.value.trim()
            if (!prompt) {
                alert("Please enter a custom prompt")
                return
            }
            executePrompt(prompt)
        })
    }

    // Copy response functionality (guard contra múltiplos listeners)
    if (copyResponseBtn && aiResponseDiv && !copyResponseBtn.dataset.listenerAdded) {
        copyResponseBtn.dataset.listenerAdded = '1'
        copyResponseBtn.addEventListener("click", function () {
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

    // Generate PDF functionality (guard contra múltiplos listeners)
    if (generatePdfBtn && aiResponseDiv && !generatePdfBtn.dataset.listenerAdded) {
        generatePdfBtn.dataset.listenerAdded = '1'
        generatePdfBtn.addEventListener("click", function () {
            const content = aiResponseDiv.textContent
            if (content && content !== "AI responses will appear here...") {
                generatePDF(content)
            } else {
                alert("No AI response to generate PDF from")
            }
        })
    }

    // Restaurar templates padrões
    if (restoreDefaultsBtn && !restoreDefaultsBtn.hasAttribute('data-listener-added')) {
        restoreDefaultsBtn.setAttribute('data-listener-added', 'true')
        restoreDefaultsBtn.addEventListener('click', () => {
            if (confirm('Restaurar os templates padrões? Isso substituirá a lista atual.')) {
                restoreDefaultTemplates()
            }
        })
    }
}

// ===== Quick Prompts Dinâmicos =====
function getQuickActions(cb) {
    chrome.storage.sync.get([QUICK_ACTIONS_KEY], (res) => {
        let actions = res[QUICK_ACTIONS_KEY]
        if (!Array.isArray(actions) || actions.length === 0) {
            actions = DEFAULT_QUICK_ACTIONS
            chrome.storage.sync.set({ [QUICK_ACTIONS_KEY]: actions }, () => cb(actions))
        } else {
            // migração leve para incluir icon
            actions = actions.map(a => ({ icon: undefined, ...a }))
            cb(actions)
        }
    })
}

function setQuickActions(actions, cb) {
    chrome.storage.sync.set({ [QUICK_ACTIONS_KEY]: actions }, () => cb && cb())
}

function renderQuickPrompts(manageMode = false) {
    const container = document.querySelector('#quick-prompts-container')
    if (!container) return
    getQuickActions((actions) => {
        container.innerHTML = actions.map(a => `
            <div class="qp-item" style="position:relative">
          <button class="quick-prompt-btn" data-id="${a.id}" data-prompt="${a.prompt.replace(/&/g, '&amp;').replace(/\"/g, '&quot;')}">${a.icon ? `${a.icon} ` : ''}${a.label}</button>
              ${manageMode ? `<button class="qp-del" data-id="${a.id}" title="Delete" style="position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; border:1px solid #a0a0a0; background:transparent; color:#a0a0a0; cursor:pointer; font-size:12px; line-height:20px;">×</button>` : ''}
            </div>
        `).join('')
    })
}

function setupDynamicQuickPrompts() {
    // Render inicial
    renderQuickPrompts(false)

    // Delegação de eventos
    const container = document.querySelector('#quick-prompts-container')
    if (container && !container.getAttribute('data-delegate')) {
        container.setAttribute('data-delegate', '1')
        container.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */(e.target)
            const del = target.closest('.qp-del')
            if (del) {
                const id = del.getAttribute('data-id')
                if (!id) return
                getQuickActions(actions => {
                    const next = actions.filter(a => a.id !== id)
                    setQuickActions(next, () => renderQuickPrompts(true))
                })
                return
            }
            const btn = target.closest('.quick-prompt-btn')
            if (btn) {
                const p = btn.getAttribute('data-prompt')
                if (p) executePrompt(p)
            }
        })
    }

    // Manage toggle
    let manage = false
    const manageBtn = document.querySelector('#qp-manage')
    manageBtn?.addEventListener('click', () => {
        manage = !manage
        manageBtn.textContent = manage ? 'Done' : 'Manage'
        renderQuickPrompts(manage)
    })

    // Add new
    const addBtn = document.querySelector('#qp-add')
    addBtn?.addEventListener('click', () => {
        const icon = prompt('Ícone (emoji opcional, ex.: 📌). Deixe em branco para nenhum ícone:') || ''
        const label = prompt('Label:')
        if (!label) return
        const promptText = prompt('Prompt:')
        if (!promptText) return
        getQuickActions(actions => {
            const id = 'qp_' + Math.random().toString(36).slice(2, 8)
            const next = actions.concat([{ id, icon, label, prompt: promptText }])
            setQuickActions(next, () => renderQuickPrompts(manage))
        })
    })
}

// Utilidades de migração/fallback dos templates
function buildCustomDefaultTemplate() {
    const content = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modelo Padrão</title>
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
    return { id: 'modelo-padrao', name: 'Modelo padrão', content, createdAt: new Date().toISOString() }
}

async function loadAllTemplatesWithFallback() {
    return new Promise((resolve) => {
        // Buscar em local v2, local v1 e sync v1
        const normalizeAndDone = (arr) => {
            let list = Array.isArray(arr) ? arr.slice() : []
            const removableNames = new Set(['Executive Summary', 'Meeting Minutes', 'Project Update', 'Teste'])
            // Remover templates antigos automáticos, mas NÃO re-adicionar nada automaticamente
            list = list.filter(t => !removableNames.has(t?.name))
            // Persistir limpeza em V2 e V1 para evitar que voltem a aparecer
            const saveObj = {}; saveObj[TEMPLATE_STORAGE_KEY] = list
            safeStorageSet(saveObj, () => { })
            chrome.storage.sync.set({ aiTemplates: list })
            resolve(list)
        }
        safeStorageGet([TEMPLATE_STORAGE_KEY, 'aiTemplates'], (localRes) => {
            const v2 = localRes[TEMPLATE_STORAGE_KEY]
            const v1Local = localRes['aiTemplates']
            if (v2 && Array.isArray(v2) && v2.length) return normalizeAndDone(v2)
            // tentar sync.v1
            chrome.storage.sync.get(['aiTemplates'], (syncRes) => {
                const v1Sync = syncRes && Array.isArray(syncRes.aiTemplates) ? syncRes.aiTemplates : []
                const merged = (v1Local || []).concat(v1Sync || [])
                // Migrar se houver algo
                if (merged.length) {
                    const saveObj = {}; saveObj[TEMPLATE_STORAGE_KEY] = merged
                    safeStorageSet(saveObj, () => normalizeAndDone(merged))
                } else {
                    normalizeAndDone([])
                }
            })
        })
    })
}

// Restaura os templates padrões (apenas o template customizado atual)
function restoreDefaultTemplates() {
    const onlyCustom = [buildCustomDefaultTemplate()]
    const saveObj = {}; saveObj[TEMPLATE_STORAGE_KEY] = onlyCustom
    safeStorageSet(saveObj, () => {
        chrome.storage.sync.set({ aiTemplates: onlyCustom }, () => {
            loadTemplates()
            alert('Templates padrão restaurados.')
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

            const names = templates.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
            const pick = prompt('Escolha um template pelo número:\n' + names)
            const idx = pick ? (parseInt(pick, 10) - 1) : -1
            if (idx < 0 || idx >= templates.length) return

            const selected = templates[idx]
            aiResponseDiv.textContent = 'Gerando resumo…'
            // estado de carregamento no botão da linha
            const rowBtn = document.querySelector(`[data-generate][data-index="${meetingIndex}"]`)
            if (rowBtn instanceof HTMLButtonElement) {
                rowBtn.disabled = true
                rowBtn.textContent = 'Gerando…'
            }
            currentGeneratingMeetingIndex = meetingIndex

            // Obter dados específicos da reunião pelo índice
            chrome.storage.local.get(['meetings'], function (resultLocal) {
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
        const genBtn = target.closest('[data-generate]')
        if (genBtn) {
            const meetingIndex = Number(genBtn.getAttribute('data-index'))
            if (genBtn instanceof HTMLButtonElement) {
                genBtn.disabled = true
                genBtn.textContent = 'Gerando…'
            }
            openTemplatePickerAndGenerate(meetingIndex)
            return
        }
        const dlBtn = target.closest('[data-download-pdf]')
        if (dlBtn) {
            const idx = Number(dlBtn.getAttribute('data-index'))
            chrome.storage.local.get(['meetings'], (res) => {
                const arr = res.meetings || []
                if (idx < 0 || idx >= arr.length) return
                const meeting = arr[idx]
                const html = meeting.aiSummaryHtml
                if (html) generatePDF(String(html))
            })
            return
        }
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
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const currentTab = tabs[0]
            if (currentTab && currentTab.url && currentTab.url.includes('meet.google.com')) {
                // Get the latest meeting data
                chrome.storage.local.get(null, function (items) {
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
    chrome.storage.sync.get(["geminiApiKey", "geminiModel"], async function (result) {
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

            // Se veio da lista, persistir e atualizar botões
            if (currentGeneratingMeetingIndex !== null) {
                const idx = Number(currentGeneratingMeetingIndex)
                chrome.storage.local.get(['meetings'], (res) => {
                    const arr = res.meetings || []
                    if (idx >= 0 && idx < arr.length) {
                        arr[idx].aiSummaryHtml = aiResponse
                        chrome.storage.local.set({ meetings: arr }, () => {
                            currentGeneratingMeetingIndex = null
                            loadMeetings()
                        })
                    } else {
                        currentGeneratingMeetingIndex = null
                    }
                })
            }

        } catch (error) {
            console.error("Falha na solicitação à IA:", error)
            aiResponseDiv.textContent = `Erro: ${error.message}`
        } finally {
            if (executeBtn) executeBtn.disabled = false
            if (currentGeneratingMeetingIndex !== null) {
                const rowBtn = document.querySelector(`[data-generate][data-index="${currentGeneratingMeetingIndex}"]`)
                if (rowBtn instanceof HTMLButtonElement) {
                    rowBtn.disabled = false
                    rowBtn.textContent = 'Gerar resumo'
                }
            }
        }
    })
}

// Impressão via iframe oculto (fallback que usa a caixa de diálogo do navegador)
function printHtmlViaIframe(htmlContent) {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
        try { window.removeEventListener('afterprint', cleanup) } catch { }
        try { iframe.parentNode && iframe.parentNode.removeChild(iframe) } catch { }
    }

    const triggerPrint = () => {
        const win = iframe.contentWindow
        if (!win) { cleanup(); return }
        try { window.addEventListener('afterprint', cleanup) } catch { }
        setTimeout(() => { try { win.focus(); win.print() } catch { } }, 50)
        setTimeout(cleanup, 3000)
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
        doc.open()
        doc.write(htmlContent)
        doc.close()
        if (doc.readyState === 'complete') triggerPrint()
        else iframe.onload = triggerPrint
    } else {
        cleanup()
        alert('Não foi possível preparar a impressão.')
    }
}

async function generatePDF(content) {
    try {
        // 1) Limpeza de cercas de código
        let cleanContent = content
            .replace(/```html\s*/g, '')
            .replace(/```\s*/g, '')
            .trim()

        const isHtmlContent = cleanContent.trim().startsWith('<') || cleanContent.includes('<html')

        // 2) Tentar PDF direto (sem cabeçalho/rodapé do navegador)
        if (typeof window !== 'undefined' && typeof window.html2pdf !== 'undefined') {
            // Wrapper branco com largura A4; sem margens externas do PDF
            const wrapper = document.createElement('div')
            wrapper.style.background = '#ffffff'
            wrapper.style.color = '#000000'
            wrapper.style.width = '210mm'
            wrapper.style.minHeight = '297mm'
            wrapper.style.boxSizing = 'border-box'
            // Padding interno agradável; não é cabeçalho/rodapé do navegador
            wrapper.style.padding = '12mm'
            wrapper.style.fontFamily = 'Arial, sans-serif'
            wrapper.style.lineHeight = '1.45'

            // Estilos básicos opcionais
            const baseStyles = `
                <style>
                    h1 { color:#2A9ACA; border-bottom:2px solid #2A9ACA; padding-bottom:8px; margin-top:0; }
                    .content { white-space: pre-wrap; background:#f6f8fa; padding:12px; border-radius:5px; border-left:4px solid #2A9ACA; }
                </style>`

            if (isHtmlContent) {
                // Evitar html/head/body aninhados; usar apenas o inner do usuário
                // Remove <html> e <body> se existirem
                const bodyMatch = cleanContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
                const inner = bodyMatch ? bodyMatch[1] : cleanContent
                wrapper.innerHTML = baseStyles + inner
            } else {
                const generated = `
                    ${baseStyles}
                    <h1>Resumo da Reunião</h1>
                    <p><strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
                    <div class="content">${escapeHtml(cleanContent)}</div>
                `
                wrapper.innerHTML = generated
            }

            // Inserir temporariamente no DOM para renderização
            wrapper.style.position = 'fixed'
            wrapper.style.left = '-10000px'
            document.body.appendChild(wrapper)

            const filenameId = Math.random().toString(36).slice(2, 8)
            const opt = {
                margin: [0, 0, 0, 0],
                filename: `Resumo da Reunião - ${filenameId}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
                pagebreak: { mode: ['css', 'legacy'] }
            }

            try {
                await window.html2pdf().set(opt).from(wrapper).save()
                // Remover wrapper após salvar
                try { wrapper.remove() } catch { }
                return
            } catch (genErr) {
                console.warn('Falha na geração direta de PDF, caindo para impressão:', genErr)
                try { wrapper.remove() } catch { }
                // Continua para fallback de impressão
            }
        }

        // 3) Fallback: imprimir via iframe (poderá exibir cabeçalho/rodapé do navegador)
        const baseHead = `
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Resumo da Reunião - TranscripTonic</title>
            <style>
                @page { size: A4; margin: 0; }
                body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin:0; padding:20px; }
                h1 { color:#2A9ACA; border-bottom:2px solid #2A9ACA; padding-bottom:10px; }
                .content { white-space: pre-wrap; background:#f9f9f9; padding:15px; border-radius:5px; border-left:4px solid #2A9ACA; }
                .no-print { display:none !important; }
            </style>`

        const htmlContent = isHtmlContent
            ? (cleanContent.includes('</head>')
                ? cleanContent.replace('</head>', `${baseHead}</head>`)
                : `<!DOCTYPE html><html><head>${baseHead}</head><body>${cleanContent}</body></html>`)
            : `<!DOCTYPE html><html lang="pt-BR"><head>${baseHead}</head><body>
                <h1>Resumo da Reunião</h1>
                <p><strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
                <div class="content">${escapeHtml(cleanContent)}</div>
            </body></html>`

        printHtmlViaIframe(htmlContent)

    } catch (error) {
        console.error('Erro ao gerar PDF:', error)
        alert('Erro ao gerar PDF. Tente novamente.')
    }
}