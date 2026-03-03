from app import create_app
print("Initializing app to trigger DB creation...")
try:
    app = create_app()
    print("App created successfully.")
except Exception as e:
    print(f"Error creating app: {e}")
