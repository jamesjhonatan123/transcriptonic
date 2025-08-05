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

  // Create default templates on first run
  chrome.storage.sync.get(["aiTemplates", "defaultTemplatesCreated"], function(result) {
    if (!result.defaultTemplatesCreated) {
      const defaultTemplates = [
        {
          id: "executive-summary",
          name: "Executive Summary",
          content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2A9ACA; border-bottom: 2px solid #2A9ACA; padding-bottom: 10px;">Executive Summary</h1>
            <p><strong>Date:</strong> {{date}}</p>
            <p><strong>Participants:</strong> {{participants}}</p>
            
            <h2 style="color: #333; margin-top: 30px;">Key Discussion Points</h2>
            {{summary}}
            
            <h2 style="color: #333; margin-top: 30px;">Action Items</h2>
            <ul>
              <li>Action items will be extracted from the meeting</li>
            </ul>
            
            <h2 style="color: #333; margin-top: 30px;">Next Steps</h2>
            <p>Next steps and follow-up actions will be listed here.</p>
          </div>`,
          createdAt: new Date().toISOString()
        },
        {
          id: "meeting-minutes",
          name: "Meeting Minutes",
          content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2A9ACA;">Meeting Minutes</h1>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date:</td><td style="padding: 8px; border: 1px solid #ddd;">{{date}}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Attendees:</td><td style="padding: 8px; border: 1px solid #ddd;">{{participants}}</td></tr>
            </table>
            
            <h2 style="color: #333;">Discussion Summary</h2>
            {{summary}}
            
            <h2 style="color: #333;">Decisions Made</h2>
            <p>Key decisions will be listed here.</p>
            
            <h2 style="color: #333;">Action Items</h2>
            <p>Action items with owners and deadlines will be listed here.</p>
          </div>`,
          createdAt: new Date().toISOString()
        },
        {
          id: "project-update",
          name: "Project Update",
          content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2A9ACA;">Project Update</h1>
            <p><strong>Date:</strong> {{date}} | <strong>Team:</strong> {{participants}}</p>
            
            <h2 style="color: #333;">Progress Overview</h2>
            {{summary}}
            
            <h2 style="color: #333;">Achievements</h2>
            <ul><li>Key achievements will be listed here</li></ul>
            
            <h2 style="color: #333;">Challenges & Blockers</h2>
            <ul><li>Challenges and blockers will be identified here</li></ul>
            
            <h2 style="color: #333;">Next Milestones</h2>
            <ul><li>Upcoming milestones and deadlines will be listed here</li></ul>
          </div>`,
          createdAt: new Date().toISOString()
        }
      ]
      
      chrome.storage.sync.set({ 
        aiTemplates: defaultTemplates,
        defaultTemplatesCreated: true 
      })
    }
  })

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