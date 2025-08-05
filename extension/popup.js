// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const geminiApiKeyInput = document.querySelector("#gemini-api-key")
  const saveApiKeyButton = document.querySelector("#save-api-key")
  const testApiKeyButton = document.querySelector("#test-api-key")
  const apiStatusDiv = document.querySelector("#api-status")

  // Tab system elements
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabContents = document.querySelectorAll(".tab-content")

  // Template elements
  const templateNameInput = document.querySelector("#template-name")
  const templateContentTextarea = document.querySelector("#template-content")
  const saveTemplateButton = document.querySelector("#save-template")
  const templateStatusDiv = document.querySelector("#template-status")
  const templatesListDiv = document.querySelector("#templates-list")

  // AI elements
  const quickPromptButtons = document.querySelectorAll(".quick-prompt-btn")
  const customPromptTextarea = document.querySelector("#custom-prompt")
  const executeCustomPromptButton = document.querySelector("#execute-custom-prompt")
  const aiResponseDiv = document.querySelector("#ai-response")
  const copyResponseButton = document.querySelector("#copy-response")
  const clearResponseButton = document.querySelector("#clear-response")

  // Initialize version
  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  // Tab system functionality
  tabButtons.forEach(button => {
    button.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab")
      
      // Remove active class from all tabs and contents
      tabButtons.forEach(btn => btn.classList.remove("active"))
      tabContents.forEach(content => content.classList.remove("active"))
      
      // Add active class to clicked tab and corresponding content
      this.classList.add("active")
      document.getElementById(`${tabName}-tab`).classList.add("active")
    })
  })

  // Load saved settings
  loadSavedSettings()
  loadTemplates()

  // Create default templates on first run
  createDefaultTemplates()

  // Settings Tab Event Listeners
  setupSettingsTab()

  // Templates Tab Event Listeners
  setupTemplatesTab()

  // AI Tab Event Listeners
  setupAITab()

  function loadSavedSettings() {
    // Load operation mode
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
      }
    })

    // Load Gemini API key
    chrome.storage.sync.get(["geminiApiKey"], function (result) {
      if (result.geminiApiKey && geminiApiKeyInput instanceof HTMLInputElement) {
        geminiApiKeyInput.value = result.geminiApiKey
      }
    })
  }

  function setupSettingsTab() {
    // Operation mode event listeners
    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }

    // Save Gemini API key
    if (saveApiKeyButton instanceof HTMLButtonElement && geminiApiKeyInput instanceof HTMLInputElement) {
      saveApiKeyButton.addEventListener("click", function () {
        const apiKey = geminiApiKeyInput.value.trim()
        if (apiKey) {
          chrome.storage.sync.set({ geminiApiKey: apiKey }, function () {
            showStatus(apiStatusDiv, "Chave API salva com sucesso!", "success")
          })
        } else {
          showStatus(apiStatusDiv, "Por favor, insira uma chave API válida", "error")
        }
      })
    }

    // Test Gemini API key
    if (testApiKeyButton instanceof HTMLButtonElement && geminiApiKeyInput instanceof HTMLInputElement) {
      testApiKeyButton.addEventListener("click", async function () {
        const apiKey = geminiApiKeyInput.value.trim()
        if (!apiKey) {
          showStatus(apiStatusDiv, "Por favor, insira uma chave API primeiro", "error")
          return
        }

        testApiKeyButton.textContent = "Testando..."
        testApiKeyButton.disabled = true

        try {
          // Use the correct endpoint for Gemini 1.5 Flash
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: "Hello, this is a test message. Please respond with 'API key is working correctly.'"
                }]
              }]
            })
          })

          if (response.ok) {
            const data = await response.json()
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              showStatus(apiStatusDiv, "✅ Chave API válida e funcionando!", "success")
            } else {
              throw new Error("Resposta inválida da API")
            }
          } else {
            const errorData = await response.json()
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`)
          }
        } catch (error) {
          console.error("Erro no teste da API:", error)
          showStatus(apiStatusDiv, `❌ Chave API inválida: ${error.message}`, "error")
        } finally {
          testApiKeyButton.textContent = "Testar"
          testApiKeyButton.disabled = false
        }
      })
    }
  }

  function setupTemplatesTab() {
    if (saveTemplateButton instanceof HTMLButtonElement && templateNameInput instanceof HTMLInputElement && templateContentTextarea instanceof HTMLTextAreaElement) {
      saveTemplateButton.addEventListener("click", function () {
        const name = templateNameInput.value.trim()
        const content = templateContentTextarea.value.trim()

        if (!name || !content) {
          showStatus(templateStatusDiv, "Por favor, preencha o nome e conteúdo do template", "error")
          return
        }

        const template = {
          id: Date.now().toString(),
          name: name,
          content: content,
          createdAt: new Date().toISOString()
        }

        // Get existing templates and add new one
        chrome.storage.sync.get(["aiTemplates"], function (result) {
          const templates = result.aiTemplates || []
          templates.push(template)

          chrome.storage.sync.set({ aiTemplates: templates }, function () {
            showStatus(templateStatusDiv, "Template salvo com sucesso!", "success")
            templateNameInput.value = ""
            templateContentTextarea.value = ""
            loadTemplates()
          })
        })
      })
    }
  }

  function setupAITab() {
    // Quick prompt buttons
    quickPromptButtons.forEach(button => {
      button.addEventListener("click", function () {
        const prompt = this.getAttribute("data-prompt")
        if (prompt) {
          executeAIPrompt(prompt)
        }
      })
    })

    // Custom prompt execution
    if (executeCustomPromptButton instanceof HTMLButtonElement && customPromptTextarea instanceof HTMLTextAreaElement) {
      executeCustomPromptButton.addEventListener("click", function () {
        const prompt = customPromptTextarea.value.trim()
        if (prompt) {
          executeAIPrompt(prompt)
        } else {
          showStatus(null, "Por favor, digite um prompt personalizado", "error")
        }
      })
    }

    // Copy response
    if (copyResponseButton instanceof HTMLButtonElement) {
      copyResponseButton.addEventListener("click", function () {
        const responseText = aiResponseDiv?.textContent || ""
        if (responseText && responseText !== "As respostas da IA aparecerão aqui...") {
          navigator.clipboard.writeText(responseText).then(() => {
            copyResponseButton.textContent = "✅ Copiado!"
            setTimeout(() => {
              copyResponseButton.textContent = "📋 Copiar"
            }, 2000)
          })
        }
      })
    }

    // Clear response
    if (clearResponseButton instanceof HTMLButtonElement) {
      clearResponseButton.addEventListener("click", function () {
        if (aiResponseDiv) {
          aiResponseDiv.textContent = "As respostas da IA aparecerão aqui..."
        }
      })
    }
  }

  function loadTemplates() {
    if (!templatesListDiv) return

    chrome.storage.sync.get(["aiTemplates"], function (result) {
      const templates = result.aiTemplates || []
      
      if (templates.length === 0) {
        templatesListDiv.innerHTML = '<p class="sub-text">Nenhum template salvo ainda.</p>'
        return
      }

      templatesListDiv.innerHTML = templates.map(template => `
        <div class="template-item">
          <div class="template-name">${escapeHtml(template.name)}</div>
          <div class="template-actions">
            <button onclick="editTemplate('${template.id}')" class="secondary">Editar</button>
            <button onclick="deleteTemplate('${template.id}')" class="secondary">Excluir</button>
          </div>
        </div>
      `).join("")
    })
  }

  // Make template functions global
  window.editTemplate = function(templateId) {
    chrome.storage.sync.get(["aiTemplates"], function (result) {
      const templates = result.aiTemplates || []
      const template = templates.find(t => t.id === templateId)
      
      if (template && templateNameInput instanceof HTMLInputElement && templateContentTextarea instanceof HTMLTextAreaElement) {
        templateNameInput.value = template.name
        templateContentTextarea.value = template.content
        
        // Remove the old template when saving the edited one
        window.editingTemplateId = templateId
      }
    })
  }

  window.deleteTemplate = function(templateId) {
    if (confirm("Tem certeza que deseja excluir este template?")) {
      chrome.storage.sync.get(["aiTemplates"], function (result) {
        const templates = result.aiTemplates || []
        const updatedTemplates = templates.filter(t => t.id !== templateId)
        
        chrome.storage.sync.set({ aiTemplates: updatedTemplates }, function () {
          loadTemplates()
          showStatus(templateStatusDiv, "Template excluído com sucesso!", "success")
        })
      })
    }
  }

  async function executeAIPrompt(prompt) {
    if (!aiResponseDiv) return

    // Check if API key is configured
    chrome.storage.sync.get(["geminiApiKey"], async function(result) {
      if (!result.geminiApiKey) {
        aiResponseDiv.textContent = "Por favor, configure sua chave API do Gemini na aba Configurações primeiro."
        return
      }

      try {
        aiResponseDiv.textContent = "Gerando resposta..."
        if (executeCustomPromptButton) executeCustomPromptButton.disabled = true

        // Get current meeting transcript for context
        const meetingData = await getCurrentMeetingData()
        const contextualPrompt = meetingData 
          ? `Contexto: Transcrição da reunião atual: ${meetingData.transcript}\n\nSolicitação do usuário: ${prompt}`
          : prompt

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${result.geminiApiKey}`, {
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
          const errorData = await response.json()
          throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`)
        }

        const data = await response.json()
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nenhuma resposta gerada"
        aiResponseDiv.textContent = aiResponse

      } catch (error) {
        console.error("Falha na solicitação de IA:", error)
        aiResponseDiv.textContent = `Erro: ${error.message}`
      } finally {
        if (executeCustomPromptButton) executeCustomPromptButton.disabled = false
      }
    })
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
                title: latestMeeting.meetingTitle || "Reunião Atual",
                date: new Date().toLocaleDateString(),
                participants: latestMeeting.transcript ? 
                  [...new Set(latestMeeting.transcript.map(t => t.personName))].join(", ") : 
                  "Desconhecido",
                transcript: latestMeeting.transcript ? 
                  latestMeeting.transcript.map(t => `${t.personName}: ${t.transcriptText}`).join("\n") :
                  "Nenhuma transcrição disponível"
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

  function createDefaultTemplates() {
    chrome.storage.sync.get(["aiTemplates", "defaultTemplatesCreated"], function(result) {
      if (!result.defaultTemplatesCreated) {
        const defaultTemplates = [
          {
            id: "executive-summary",
            name: "Resumo Executivo",
            content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2A9ACA; border-bottom: 2px solid #2A9ACA; padding-bottom: 10px;">Resumo Executivo</h1>
              <p><strong>Data:</strong> {{date}}</p>
              <p><strong>Participantes:</strong> {{participants}}</p>
              
              <h2 style="color: #333; margin-top: 30px;">Pontos-Chave da Discussão</h2>
              {{summary}}
              
              <h2 style="color: #333; margin-top: 30px;">Itens de Ação</h2>
              <ul>
                <li>Itens de ação serão extraídos da reunião</li>
              </ul>
              
              <h2 style="color: #333; margin-top: 30px;">Próximos Passos</h2>
              <p>Próximos passos e ações de acompanhamento serão listados aqui.</p>
            </div>`,
            createdAt: new Date().toISOString()
          },
          {
            id: "meeting-minutes",
            name: "Ata da Reunião",
            content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2A9ACA;">Ata da Reunião</h1>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Data:</td><td style="padding: 8px; border: 1px solid #ddd;">{{date}}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Participantes:</td><td style="padding: 8px; border: 1px solid #ddd;">{{participants}}</td></tr>
              </table>
              
              <h2 style="color: #333;">Resumo da Discussão</h2>
              {{summary}}
              
              <h2 style="color: #333;">Decisões Tomadas</h2>
              <p>Decisões importantes serão listadas aqui.</p>
              
              <h2 style="color: #333;">Itens de Ação</h2>
              <p>Itens de ação com responsáveis e prazos serão listados aqui.</p>
            </div>`,
            createdAt: new Date().toISOString()
          },
          {
            id: "project-update",
            name: "Atualização do Projeto",
            content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2A9ACA;">Atualização do Projeto</h1>
              <p><strong>Data:</strong> {{date}} | <strong>Equipe:</strong> {{participants}}</p>
              
              <h2 style="color: #333;">Visão Geral do Progresso</h2>
              {{summary}}
              
              <h2 style="color: #333;">Conquistas</h2>
              <ul><li>Principais conquistas serão listadas aqui</li></ul>
              
              <h2 style="color: #333;">Desafios e Bloqueios</h2>
              <ul><li>Desafios e bloqueios serão identificados aqui</li></ul>
              
              <h2 style="color: #333;">Próximos Marcos</h2>
              <ul><li>Próximos marcos e prazos serão listados aqui</li></ul>
            </div>`,
            createdAt: new Date().toISOString()
          }
        ]
        
        chrome.storage.sync.set({ 
          aiTemplates: defaultTemplates,
          defaultTemplatesCreated: true 
        }, function() {
          loadTemplates()
        })
      }
    })
  }

  function showStatus(element, message, type) {
    if (!element) return
    
    element.innerHTML = `<div class="status-message status-${type}">${message}</div>`
    
    setTimeout(() => {
      element.innerHTML = ""
    }, 3000)
  }

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}