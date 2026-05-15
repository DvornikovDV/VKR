(function () {
  var state = {
    helpers: null,
    validatedYAML: null,
    saveReady: false,
    validationRequestID: 0,
    saveRequestID: 0
  };

  var editor = document.getElementById("yaml-editor");
  var loadStatus = document.getElementById("load-status");
  var validationStatus = document.getElementById("validation-status");
  var presetButton = document.getElementById("preset-button");
  var validateButton = document.getElementById("validate-button");
  var saveButton = document.getElementById("save-button");
  var snippetsList = document.getElementById("snippets-list");
  var enumList = document.getElementById("enum-list");
  var hintsList = document.getElementById("hints-list");

  if (!editor || !loadStatus || !validationStatus || !presetButton || !validateButton || !saveButton) {
    return;
  }

  function requestJSON(path, options) {
    return fetch(path, options).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      });
    });
  }

  function setSaveReady(ready) {
    state.saveReady = ready;
    saveButton.disabled = !ready;
  }

  function setValidation(kind, text) {
    validationStatus.className = "status status-" + kind;
    validationStatus.textContent = text;
  }

  function markDirty() {
    if (state.validatedYAML !== editor.value) {
      state.validatedYAML = null;
      setSaveReady(false);
      setValidation("idle", "Validation required");
    }
  }

  function insertText(raw) {
    var text = raw || "";
    var start = editor.selectionStart || 0;
    var end = editor.selectionEnd || 0;
    var before = editor.value.slice(0, start);
    var after = editor.value.slice(end);
    var prefix = before && !before.endsWith("\n") ? "\n" : "";
    var suffix = after && !text.endsWith("\n") ? "\n" : "";
    var inserted = prefix + text + suffix;

    editor.value = before + inserted + after;
    editor.focus();
    editor.selectionStart = editor.selectionEnd = before.length + inserted.length;
    markDirty();
  }

  function replaceWithPreset() {
    var preset = state.helpers && state.helpers.presets && state.helpers.presets[0];
    if (!preset) {
      setValidation("error", "Preset unavailable");
      return;
    }
    editor.value = preset.yaml || "";
    editor.focus();
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    markDirty();
  }

  function validateCurrent() {
    var requestID = state.validationRequestID + 1;
    var yamlSnapshot = editor.value;
    state.validationRequestID = requestID;
    setSaveReady(false);
    setValidation("pending", "Validating");

    return requestJSON("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: yamlSnapshot })
    }).then(function (payload) {
      if (requestID !== state.validationRequestID) {
        return;
      }
      if (editor.value !== yamlSnapshot) {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("idle", "Validation required");
        return;
      }
      if (payload.valid) {
        state.validatedYAML = yamlSnapshot;
        setSaveReady(true);
        setValidation("success", "Valid");
      } else {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("error", payload.error || "Invalid YAML");
      }
    }).catch(function (error) {
      if (requestID !== state.validationRequestID) {
        return;
      }
      if (editor.value !== yamlSnapshot) {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("idle", "Validation required");
        return;
      }
      state.validatedYAML = null;
      setSaveReady(false);
      setValidation("error", error.message);
    });
  }

  function saveCurrent() {
    if (!state.saveReady || state.validatedYAML !== editor.value) {
      markDirty();
      return;
    }

    var requestID = state.saveRequestID + 1;
    var yamlSnapshot = editor.value;
    state.saveRequestID = requestID;
    setSaveReady(false);
    setValidation("pending", "Saving");

    return requestJSON("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: yamlSnapshot })
    }).then(function (payload) {
      if (requestID !== state.saveRequestID) {
        return;
      }
      if (editor.value !== yamlSnapshot) {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("idle", "Validation required");
        return;
      }
      if (payload.saved && payload.validation && payload.validation.valid) {
        state.validatedYAML = yamlSnapshot;
        setSaveReady(true);
        setValidation("success", "Saved");
      } else {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("error", (payload.validation && payload.validation.error) || "Save rejected");
      }
    }).catch(function (error) {
      if (requestID !== state.saveRequestID) {
        return;
      }
      if (editor.value !== yamlSnapshot) {
        state.validatedYAML = null;
        setSaveReady(false);
        setValidation("idle", "Validation required");
        return;
      }
      state.validatedYAML = null;
      setSaveReady(false);
      setValidation("error", error.message);
    });
  }

  function renderSnippets(snippets) {
    snippetsList.textContent = "";
    (snippets || []).forEach(function (snippet) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "helper-button";
      button.textContent = snippet.label;
      button.title = snippet.description || snippet.insertAfter || "";
      button.addEventListener("click", function () {
        insertText(snippet.yaml);
      });
      snippetsList.appendChild(button);
    });
  }

  function renderEnums(enums) {
    enumList.textContent = "";
    (enums || []).forEach(function (item) {
      var row = document.createElement("div");
      row.className = "reference-row";

      var field = document.createElement("strong");
      field.textContent = item.field;

      var values = document.createElement("span");
      values.textContent = (item.values || []).join(", ");
      values.title = item.description || "";

      row.appendChild(field);
      row.appendChild(values);
      enumList.appendChild(row);
    });
  }

  function renderHints(hints) {
    hintsList.textContent = "";
    (hints || []).forEach(function (hint) {
      var row = document.createElement("div");
      row.className = "reference-row";

      var field = document.createElement("strong");
      field.textContent = hint.field;

      var text = document.createElement("span");
      text.textContent = hint.text;

      row.appendChild(field);
      row.appendChild(text);
      hintsList.appendChild(row);
    });
  }

  function loadInitialData() {
    Promise.all([
      requestJSON("/api/config"),
      requestJSON("/api/helpers")
    ]).then(function (responses) {
      var config = responses[0];
      var helperResponse = responses[1];
      state.helpers = helperResponse.helpers || {};
      editor.value = config.yaml || "";
      loadStatus.textContent = config.exists ? "Loaded existing config" : "New config";
      renderSnippets(state.helpers.snippets);
      renderEnums(state.helpers.enums);
      renderHints(state.helpers.hints);
      markDirty();
    }).catch(function (error) {
      loadStatus.textContent = "Load failed";
      setValidation("error", error.message);
    });
  }

  editor.addEventListener("input", markDirty);
  presetButton.addEventListener("click", replaceWithPreset);
  validateButton.addEventListener("click", validateCurrent);
  saveButton.addEventListener("click", saveCurrent);

  setSaveReady(false);
  loadInitialData();
}());
