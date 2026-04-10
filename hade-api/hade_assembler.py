import httpx

# Your iMac's verified IP
IMAC_URL = "http://10.0.0.21:11434/api/generate"

def assemble_hade_prompt(location, weather, mood):
    """
    Sends raw travel signals to the 2013 iMac 
    using the pre-installed HTTPX library.
    """
    context = f"Location: {location}, Weather: {weather}, Mood: {mood}"
    
    payload = {
        "model": "llama3",
        "prompt": f"HADE SIGNAL PROCESSOR: Convert into a travel prompt. {context}",
        "stream": False
    }

    print(f"📡 Routing signal to 2013 iMac Node (10.0.0.21)...")
    
    try:
        # Increasing to 300 seconds (5 minutes) 
        # This covers: Loading from SSD + CPU Inference + Network Latency
        print(f"⏳ iMac is processing... (This may take 30-60 seconds on vintage hardware)")
        
        with httpx.Client(timeout=300.0) as client:
            response = client.post(IMAC_URL, json=payload)
            response.raise_for_status()
            return response.json().get('response')
    except httpx.TimeoutException:
        return "iMac Node Error: The 2013 CPU is still thinking. Try a shorter prompt or wait longer."
    except Exception as e:
        return f"iMac Node Error: {e}"

if __name__ == "__main__":
    result = assemble_hade_prompt("Tokyo", "Rainy", "Curious")
    print("\n--- RESPONSE FROM IMAC ---\n")
    print(result)