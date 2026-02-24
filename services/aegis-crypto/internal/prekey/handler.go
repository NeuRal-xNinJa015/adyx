package prekey

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// Handler provides HTTP endpoints for pre-key bundle management.
// In Phase 2, this will be replaced with gRPC handlers.
type Handler struct {
	store *Store
}

// NewHandler creates a new pre-key HTTP handler
func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

// RegisterRoutes sets up HTTP routes on the given mux
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/prekeys/upload", h.handleUpload)
	mux.HandleFunc("GET /api/prekeys/{deviceId}", h.handleFetch)
	mux.HandleFunc("GET /api/prekeys/{deviceId}/remaining", h.handleRemaining)
	mux.HandleFunc("GET /api/health", h.handleHealth)
}

// POST /api/prekeys/upload — Upload a pre-key bundle
func (h *Handler) handleUpload(w http.ResponseWriter, r *http.Request) {
	var bundle Bundle
	if err := json.NewDecoder(r.Body).Decode(&bundle); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.store.Upload(&bundle); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	remaining := h.store.RemainingOneTimeKeys(bundle.DeviceID)
	log.Printf("  [PreKey] Bundle uploaded: device=%s, one_time_keys=%d",
		bundle.DeviceID, remaining)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":                  "uploaded",
		"device_id":               bundle.DeviceID,
		"remaining_one_time_keys": remaining,
	})
}

// GET /api/prekeys/{deviceId} — Fetch a pre-key bundle (consumes one OTK)
func (h *Handler) handleFetch(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("deviceId")
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "deviceId is required")
		return
	}

	bundle, err := h.store.Fetch(deviceID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	log.Printf("  [PreKey] Bundle fetched: device=%s", deviceID)
	writeJSON(w, http.StatusOK, bundle)
}

// GET /api/prekeys/{deviceId}/remaining — Check remaining OTKs
func (h *Handler) handleRemaining(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("deviceId")
	remaining := h.store.RemainingOneTimeKeys(deviceID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"device_id":               deviceID,
		"remaining_one_time_keys": remaining,
	})
}

// GET /api/health
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"service": "aegis-crypto",
		"status":  "online",
	})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": fmt.Sprintf("%s", message),
	})
}
