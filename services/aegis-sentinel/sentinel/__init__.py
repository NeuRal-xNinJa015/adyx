"""
AegisComms Sentinel — AI Security Analytics Engine

Provides ML-based security monitoring for the AegisComms platform.
This service has NO ACCESS to message content — it only analyzes
metadata patterns to detect threats.

Capabilities:
- Login anomaly detection (unusual times, locations, devices)
- Insider behavior analysis (access pattern anomalies)
- Traffic pattern alerts (potential data exfiltration)
- Brute force detection
- Session hijacking detection

Privacy guarantee:
- Zero message content access
- Only processes metadata: timestamps, device IDs, IP hashes
- All analysis is statistical/behavioral
- No content-based ML models
"""

__version__ = "0.1.0"
__service__ = "aegis-sentinel"
