// Package crypto provides Signal Protocol cryptographic operations
// for the AegisComms platform.
//
// This package implements:
//   - X25519 key exchange (Diffie-Hellman)
//   - Ed25519 digital signatures
//   - AES-256-GCM authenticated encryption
//   - HKDF key derivation (SHA-512)
//   - Double Ratchet key management
//   - Pre-key bundle generation and storage
//
// All operations use constant-time implementations to prevent
// timing side-channel attacks.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha512"
	"errors"
	"io"

	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
)

// KeyPair represents an X25519 key pair for key exchange
type KeyPair struct {
	PrivateKey [32]byte
	PublicKey  [32]byte
}

// SigningKeyPair represents an Ed25519 signing key pair
type SigningKeyPair struct {
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
}

// GenerateX25519KeyPair generates a new X25519 key pair for Diffie-Hellman key exchange
func GenerateX25519KeyPair() (*KeyPair, error) {
	kp := &KeyPair{}

	// Generate random private key
	if _, err := io.ReadFull(rand.Reader, kp.PrivateKey[:]); err != nil {
		return nil, err
	}

	// Clamp private key per X25519 spec
	kp.PrivateKey[0] &= 248
	kp.PrivateKey[31] &= 127
	kp.PrivateKey[31] |= 64

	// Derive public key
	pub, err := curve25519.X25519(kp.PrivateKey[:], curve25519.Basepoint)
	if err != nil {
		return nil, err
	}
	copy(kp.PublicKey[:], pub)

	return kp, nil
}

// GenerateSigningKeyPair generates a new Ed25519 signing key pair
func GenerateSigningKeyPair() (*SigningKeyPair, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &SigningKeyPair{PrivateKey: priv, PublicKey: pub}, nil
}

// DeriveSharedSecret performs X25519 Diffie-Hellman key exchange
func DeriveSharedSecret(privateKey [32]byte, peerPublicKey [32]byte) ([]byte, error) {
	return curve25519.X25519(privateKey[:], peerPublicKey[:])
}

// DeriveKey uses HKDF-SHA512 to derive a key from input keying material
func DeriveKey(ikm, salt, info []byte, length int) ([]byte, error) {
	reader := hkdf.New(sha512.New, ikm, salt, info)
	key := make([]byte, length)
	if _, err := io.ReadFull(reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

// Encrypt performs AES-256-GCM authenticated encryption
func Encrypt(key, plaintext, additionalData []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes for AES-256")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Nonce is prepended to ciphertext
	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, additionalData)
	return ciphertext, nil
}

// Decrypt performs AES-256-GCM authenticated decryption
func Decrypt(key, ciphertext, additionalData []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes for AES-256")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	nonce, ciphertextBody := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertextBody, additionalData)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

// Sign creates an Ed25519 signature
func Sign(privateKey ed25519.PrivateKey, message []byte) []byte {
	return ed25519.Sign(privateKey, message)
}

// Verify verifies an Ed25519 signature
func Verify(publicKey ed25519.PublicKey, message, signature []byte) bool {
	return ed25519.Verify(publicKey, message, signature)
}

// SecureZero overwrites a byte slice with zeros (key destruction)
func SecureZero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
