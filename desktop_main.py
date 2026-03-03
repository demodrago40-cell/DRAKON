import sys
import os
import threading
import time
import webview
import ctypes

# Import the Flask app
# Assuming app.py is in the same directory and has an 'app' instance
from app import app

MUTEX_NAME = "DrakonAI_SingleInstance_Mutex"

def is_already_running():
    """Check if another instance is already running using a Windows mutex."""
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    last_error = kernel32.GetLastError()
    # ERROR_ALREADY_EXISTS = 183
    if last_error == 183:
        kernel32.CloseHandle(mutex)
        return True
    # Keep mutex alive for the lifetime of the process (don't close it)
    return False

def focus_existing_window():
    """Find and bring the existing Drakon AI window to the foreground."""
    import ctypes.wintypes
    user32 = ctypes.windll.user32

    # Find the window by title
    hwnd = user32.FindWindowW(None, "Drakon AI")
    if hwnd:
        SW_RESTORE = 9
        user32.ShowWindow(hwnd, SW_RESTORE)
        user32.SetForegroundWindow(hwnd)

def run_flask():
    # Run Flask without the reloader to avoid main thread issues
    app.run(port=5000, use_reloader=False)

def main():
    # Single-instance check
    if is_already_running():
        focus_existing_window()
        sys.exit(0)

    # Set desktop mode flag
    os.environ['DRAKON_DESKTOP_MODE'] = 'true'

    # Start Flask in a separate thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True # Kill thread when main process exits
    flask_thread.start()
    
    # Give Flask a second to spin up
    time.sleep(1)

    # Start webview application
    webview.create_window('Drakon AI', 'http://127.0.0.1:5000', width=1280, height=800, text_select=True)
    webview.start()

if __name__ == '__main__':
    main()
