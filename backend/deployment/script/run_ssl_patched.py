"""Wrapper that patches SSL before importing anything from Onyx.

Disables SSL certificate verification globally so that the HuggingFace
tokenizer download can succeed behind firewalls that intercept HTTPS.
"""
import ssl

ssl._create_default_https_context = ssl._create_unverified_context  # noqa: S311

# Now run uvicorn — the patched SSL context will be inherited
# by all subsequent imports (including requests, httpx, huggingface_hub).
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "onyx.main:app",
        host="0.0.0.0",
        port=8080,
        log_level="info",
    )
