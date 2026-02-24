package com.aegiscomms.identity.crypto;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.*;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.math.BigInteger;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.Date;

/**
 * AegisComms Certificate Authority
 *
 * Generates and manages X.509 certificates for device identity.
 * In production: root CA key lives in HSM, only intermediate CA is online.
 * For MVP: self-signed root + intermediate generated at startup, held in memory.
 *
 * SECURITY: Root CA private key MUST be stored in HSM in production.
 */
@Component
public class CertificateAuthority {

    private static final Logger log = LoggerFactory.getLogger(CertificateAuthority.class);

    private KeyPair rootKeyPair;
    private X509Certificate rootCertificate;
    private KeyPair intermediateKeyPair;
    private X509Certificate intermediateCertificate;

    @PostConstruct
    public void initialize() throws Exception {
        Security.addProvider(new BouncyCastleProvider());
        log.info("=== AegisComms Certificate Authority Initializing ===");

        // Generate Root CA (self-signed)
        rootKeyPair = generateKeyPair();
        rootCertificate = generateRootCACert(rootKeyPair);
        log.info("  [CA] Root CA certificate generated (CN=AegisComms Root CA)");

        // Generate Intermediate CA (signed by root)
        intermediateKeyPair = generateKeyPair();
        intermediateCertificate = generateIntermediateCACert(
                intermediateKeyPair, rootKeyPair, rootCertificate);
        log.info("  [CA] Intermediate CA certificate generated (CN=AegisComms Device CA)");
        log.info("=== Certificate Authority ONLINE ===");
    }

    /**
     * Issue a device certificate signed by the intermediate CA.
     */
    public X509Certificate issueDeviceCertificate(String deviceId, String userId,
                                                    PublicKey devicePublicKey) throws Exception {
        X500Name issuer = new X500Name("CN=AegisComms Device CA, O=AegisComms, OU=PKI");
        X500Name subject = new X500Name(
                String.format("CN=%s, OU=%s, O=AegisComms", deviceId, userId));

        long now = System.currentTimeMillis();
        Date notBefore = new Date(now);
        Date notAfter = new Date(now + 365L * 24 * 60 * 60 * 1000); // 1 year

        BigInteger serial = BigInteger.valueOf(now);

        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                issuer, serial, notBefore, notAfter, subject, devicePublicKey);

        // Add extensions
        builder.addExtension(Extension.basicConstraints, true,
                new BasicConstraints(false)); // Not a CA
        builder.addExtension(Extension.keyUsage, true,
                new KeyUsage(KeyUsage.digitalSignature | KeyUsage.keyAgreement));

        ContentSigner signer = new JcaContentSignerBuilder("SHA256withECDSA")
                .setProvider("BC")
                .build(intermediateKeyPair.getPrivate());

        X509Certificate cert = new JcaX509CertificateConverter()
                .setProvider("BC")
                .getCertificate(builder.build(signer));

        log.info("  [CA] Device certificate issued: device={}, user={}", deviceId, userId);
        return cert;
    }

    public X509Certificate getRootCertificate() {
        return rootCertificate;
    }

    public X509Certificate getIntermediateCertificate() {
        return intermediateCertificate;
    }

    // --- Internal methods ---

    private KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC", "BC");
        kpg.initialize(256); // P-256 curve
        return kpg.generateKeyPair();
    }

    private X509Certificate generateRootCACert(KeyPair kp) throws Exception {
        X500Name name = new X500Name("CN=AegisComms Root CA, O=AegisComms, OU=PKI");
        long now = System.currentTimeMillis();

        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                name,
                BigInteger.valueOf(now),
                new Date(now),
                new Date(now + 10L * 365 * 24 * 60 * 60 * 1000), // 10 years
                name,
                kp.getPublic());

        builder.addExtension(Extension.basicConstraints, true,
                new BasicConstraints(true)); // IS a CA
        builder.addExtension(Extension.keyUsage, true,
                new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign));

        ContentSigner signer = new JcaContentSignerBuilder("SHA256withECDSA")
                .setProvider("BC").build(kp.getPrivate());

        return new JcaX509CertificateConverter()
                .setProvider("BC").getCertificate(builder.build(signer));
    }

    private X509Certificate generateIntermediateCACert(KeyPair intermediateKP,
                                                         KeyPair rootKP,
                                                         X509Certificate rootCert) throws Exception {
        X500Name issuer = new X500Name("CN=AegisComms Root CA, O=AegisComms, OU=PKI");
        X500Name subject = new X500Name("CN=AegisComms Device CA, O=AegisComms, OU=PKI");
        long now = System.currentTimeMillis();

        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                issuer,
                BigInteger.valueOf(now + 1),
                new Date(now),
                new Date(now + 5L * 365 * 24 * 60 * 60 * 1000), // 5 years
                subject,
                intermediateKP.getPublic());

        builder.addExtension(Extension.basicConstraints, true,
                new BasicConstraints(0)); // CA with path length 0
        builder.addExtension(Extension.keyUsage, true,
                new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign));

        ContentSigner signer = new JcaContentSignerBuilder("SHA256withECDSA")
                .setProvider("BC").build(rootKP.getPrivate());

        return new JcaX509CertificateConverter()
                .setProvider("BC").getCertificate(builder.build(signer));
    }
}
