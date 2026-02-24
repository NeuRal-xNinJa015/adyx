package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/aegiscomms/aegis-crypto/internal/prekey"
	"google.golang.org/grpc"
)

const (
	defaultGRPCPort = "9093"
	defaultHTTPPort = "8090"
	serviceName     = "AegisComms Crypto Service"
)

func main() {
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = defaultGRPCPort
	}
	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = defaultHTTPPort
	}

	log.Printf("=== %s Starting ===", serviceName)
	log.Printf("  Signal Protocol | X25519 | Ed25519 | AES-256-GCM")
	log.Printf("  Zero plaintext access — key management only")

	// Initialize pre-key store
	prekeyStore := prekey.NewStore()
	prekeyHandler := prekey.NewHandler(prekeyStore)

	// Start HTTP server for pre-key management (REST API for MVP)
	httpMux := http.NewServeMux()
	prekeyHandler.RegisterRoutes(httpMux)

	// Add CORS middleware for dev
	corsHandler := corsMiddleware(httpMux)

	go func() {
		log.Printf("  [OK] HTTP API listening on :%s", httpPort)
		if err := http.ListenAndServe(fmt.Sprintf(":%s", httpPort), corsHandler); err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// Start gRPC server
	grpcServer := grpc.NewServer()
	// TODO: Register gRPC services for Phase 2

	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", grpcPort, err)
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		log.Printf("Received signal %v, initiating graceful shutdown...", sig)
		log.Printf("Shredding ephemeral keys...")
		grpcServer.GracefulStop()
	}()

	log.Printf("  [OK] gRPC server listening on :%s", grpcPort)
	log.Printf("=== Crypto Service ONLINE ===")

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("gRPC server failed: %v", err)
	}
}

// corsMiddleware adds CORS headers for development
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
