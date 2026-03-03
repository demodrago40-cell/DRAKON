import requests
import logging

# Mock Config
class Config:
    OLLAMA_API_URL = "http://127.0.0.1:11434/v1"

def test_logic():
    print("Testing App Logic...")
    models = []
    
    try:
        # Try 127.0.0.1 first
        print(f"Connecting to Ollama at {Config.OLLAMA_API_URL}...")
        try:
            resp = requests.get(f"{Config.OLLAMA_API_URL}/models", timeout=2)
        except Exception as e:
            print(f"127.0.0.1 failed: {e}")
            # Fallback to localhost
            fallback_url = Config.OLLAMA_API_URL.replace("127.0.0.1", "localhost")
            print(f"Retrying Ollama at {fallback_url}...")
            resp = requests.get(f"{fallback_url}/models", timeout=2)

        if resp.status_code == 200:
            data = resp.json().get('data', [])
            print(f"Ollama models found: {len(data)}")
            for m in data:
                models.append({"id": m['id'], "name": f"🖥️ {m['id']} (Local)", "provider": "ollama"})
        else:
            print(f"Ollama check failed: {resp.status_code}")
            models.append({"id": "ollama-placeholder", "name": "⚠️ Ollama Not Running", "provider": "ollama"})
            
    except Exception as e:
        print(f"Ollama not reachable: {e}")
        models.append({"id": "ollama-placeholder", "name": "⚠️ Ollama Not Running", "provider": "ollama"})
        
    print("Models:", models)

if __name__ == "__main__":
    test_logic()
