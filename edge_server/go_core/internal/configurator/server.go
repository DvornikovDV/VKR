package configurator

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

//go:embed web/index.html web/app.js web/styles.css
var webAssets embed.FS

type Server struct {
	files     ConfigFileService
	validator ValidationService
}

func NewServer(files ConfigFileService) http.Handler {
	return Server{
		files:     files,
		validator: ValidationService{},
	}
}

func (s Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/config":
		s.handleConfig(w, r)
	case "/api/helpers":
		s.handleHelpers(w, r)
	case "/api/validate":
		s.handleValidate(w, r)
	case "/api/save":
		s.handleSave(w, r)
	case "/", "/index.html":
		s.serveAsset(w, r, "web/index.html", "text/html; charset=utf-8")
	case "/app.js":
		s.serveAsset(w, r, "web/app.js", "text/javascript; charset=utf-8")
	case "/styles.css":
		s.serveAsset(w, r, "web/styles.css", "text/css; charset=utf-8")
	default:
		http.NotFound(w, r)
	}
}

func (s Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	loaded, err := s.files.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, loaded)
}

func (s Server) handleHelpers(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	helpers, err := HelperCatalog()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, HelperDataResponse{Helpers: helpers})
}

func (s Server) handleValidate(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request ValidationRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.validator.Validate(request.YAML))
}

func (s Server) handleSave(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request SaveRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	saved, err := s.files.Save(request.YAML)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s Server) serveAsset(w http.ResponseWriter, r *http.Request, path string, contentType string) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	raw, err := webAssets.ReadFile(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", contentType)
	http.ServeContent(w, r, path, time.Time{}, bytes.NewReader(raw))
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	return false
}

func decodeJSON(r *http.Request, output any) error {
	if r.Body == nil {
		return fmt.Errorf("request body is required")
	}
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(output); err != nil {
		return fmt.Errorf("decode JSON body: %w", err)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
