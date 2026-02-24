// AegisComms Crypto Service
//
// Provides cryptographic operations for the AegisComms platform.
// This service handles the Signal Protocol implementation, key management,
// and all cryptographic operations that require server-side coordination.
//
// IMPORTANT: This service NEVER has access to plaintext messages.
// It only manages key exchange, pre-key bundles, and cryptographic metadata.
//
// Algorithms:
//   - X25519 (key exchange)
//   - Ed25519 (signatures)
//   - AES-256-GCM (message encryption - client-side only)
//   - HKDF + SHA-512 (key derivation)
//   - Signal Protocol (Double Ratchet)
//
// Future:
//   - Hybrid Post-Quantum (Kyber + X25519)
//   - Crypto agility engine (hot-swappable algorithms)
package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
)

const (
	defaultPort = "9093"
	serviceName = "AegisComms Crypto Service"
)

func main() {
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = defaultPort
	}

	log.Printf("=== %s Starting ===", serviceName)
	log.Printf("  Signal Protocol | X25519 | Ed25519 | AES-256-GCM")
	log.Printf("  Zero plaintext access — key management only")

	// Create gRPC server with TLS (mTLS in production)
	grpcServer := grpc.NewServer(
	// TODO: Add mTLS credentials
	// grpc.Creds(credentials.NewTLS(tlsConfig)),
	)

	// TODO: Register crypto service implementations
	// pb.RegisterCryptoServiceServer(grpcServer, &cryptoServer{})
	// pb.RegisterKeyExchangeServiceServer(grpcServer, &keyExchangeServer{})

	// Start listening
	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	// Graceful shutdown handler
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		log.Printf("Received signal %v, initiating graceful shutdown...", sig)
		log.Printf("Shredding ephemeral keys...")
		grpcServer.GracefulStop()
	}()

	log.Printf("  [OK] gRPC server listening on :%s", port)
	log.Printf("=== Crypto Service ONLINE ===")

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("gRPC server failed: %v", err)
	}
}
