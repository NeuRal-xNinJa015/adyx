package prekey

import (
	"errors"
	"sync"
	"time"
)

// Bundle represents a Signal Protocol pre-key bundle for a device
type Bundle struct {
	DeviceID               string    `json:"device_id"`
	IdentityKey            []byte    `json:"identity_key"`
	SignedPreKey           []byte    `json:"signed_pre_key"`
	SignedPreKeySignature  []byte    `json:"signed_pre_key_signature"`
	SignedPreKeyID         int32     `json:"signed_pre_key_id"`
	OneTimePreKeys        [][]byte  `json:"one_time_pre_keys"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// Store manages pre-key bundles for Signal Protocol key exchange.
// For MVP: in-memory storage. Phase 2: Redis + PostgreSQL backed.
type Store struct {
	mu      sync.RWMutex
	bundles map[string]*Bundle // deviceID -> Bundle
}

// NewStore creates a new in-memory pre-key store
func NewStore() *Store {
	return &Store{
		bundles: make(map[string]*Bundle),
	}
}

// Upload stores a pre-key bundle for a device
func (s *Store) Upload(bundle *Bundle) error {
	if bundle.DeviceID == "" {
		return errors.New("device_id is required")
	}
	if len(bundle.IdentityKey) == 0 {
		return errors.New("identity_key is required")
	}
	if len(bundle.SignedPreKey) == 0 {
		return errors.New("signed_pre_key is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	bundle.UpdatedAt = time.Now()
	s.bundles[bundle.DeviceID] = bundle
	return nil
}

// Fetch retrieves a pre-key bundle and consumes ONE one-time pre-key.
// This is the Signal Protocol key exchange initiation flow.
func (s *Store) Fetch(deviceID string) (*Bundle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	bundle, exists := s.bundles[deviceID]
	if !exists {
		return nil, errors.New("no pre-key bundle for device: " + deviceID)
	}

	// Create a copy to return (don't expose internal state)
	result := &Bundle{
		DeviceID:              bundle.DeviceID,
		IdentityKey:           bundle.IdentityKey,
		SignedPreKey:          bundle.SignedPreKey,
		SignedPreKeySignature: bundle.SignedPreKeySignature,
		SignedPreKeyID:        bundle.SignedPreKeyID,
		UpdatedAt:            bundle.UpdatedAt,
	}

	// Consume one one-time pre-key (if available)
	if len(bundle.OneTimePreKeys) > 0 {
		result.OneTimePreKeys = [][]byte{bundle.OneTimePreKeys[0]}
		bundle.OneTimePreKeys = bundle.OneTimePreKeys[1:]
	}

	return result, nil
}

// RemainingOneTimeKeys returns the count of remaining one-time pre-keys
func (s *Store) RemainingOneTimeKeys(deviceID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	bundle, exists := s.bundles[deviceID]
	if !exists {
		return 0
	}
	return len(bundle.OneTimePreKeys)
}

// Delete removes a device's pre-key bundle (e.g., on device revocation)
func (s *Store) Delete(deviceID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.bundles, deviceID)
}
